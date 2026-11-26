import { createHash } from 'node:crypto';

import {
    NEW_PASSWORD,
    PASSWORD,
    makeHarness,
    seedAccounts,
} from '../../../test/support/identity-harness.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('forgot and reset password with AuthToken (FR-AUTH-04)', () => {
    it('answers the same for a known and an unknown email, and sends mail only for the known one', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const known = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });
        const unknown = await h.service.forgotPassword({ workEmail: 'nobody@bs23.test' });

        expect(known).toEqual(unknown);
        expect(h.mail.send).toHaveBeenCalledTimes(1);
        expect(h.db.rows('authToken')).toHaveLength(1);
        expect(h.db.rows('authToken')[0]).toMatchObject({ pmId: 'PM001', type: 'PASSWORD_RESET' });
    });

    it('the reset link expires in 30 minutes and only its hash is stored', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);

        const result = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        const [row] = h.db.rows('authToken');
        expect(Math.abs(row.expiresAt.getTime() - Date.now() - 30 * 60 * 1000)).toBeLessThanOrEqual(5000);
        expect(row.tokenHash).toBe(sha256(result.resetToken as string));
        expect(JSON.stringify(h.db.rows('authToken'))).not.toContain(result.resetToken as string);
    });

    it('works for a user too (by their registered email, token owned through userId)', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);

        const result = await h.service.forgotPassword({ workEmail: 'BS23001@bs23.test' });
        expect(h.db.rows('authToken')[0]).toMatchObject({ userId: 'BS23001', pmId: null });

        await h.service.resetPassword({ token: result.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
        const login = await h.service.login({ identifier: 'BS23001', password: NEW_PASSWORD });
        expect(login.user.role).toBe('USER');
    });

    it('does not send a reset to an archived user', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23002',
            workspaceId: workspace.id,
            email: 'archived@bs23.test',
            archivedAt: new Date(),
        });

        await h.service.forgotPassword({ workEmail: 'archived@bs23.test' });

        expect(h.mail.send).toHaveBeenCalledTimes(0);
        expect(h.db.rows('authToken')).toHaveLength(0);
    });

    it('skips an email that matches more than one account (old data: new data cannot, the email is unique everywhere)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const other = h.db.addWorkspace({ slug: 'second' });
        h.db.enforceEmailTriggers = false; // rows from before the global-unique-email migration
        h.db.addPm(h.passwordHash, { pmId: 'PM002', workspaceId: other.id, email: 'pm001@bs23.test' });

        const result = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        expect(result.message).toBe('If the account exists, a password reset link will be sent.');
        expect(h.db.rows('authToken')).toHaveLength(0);
        expect(h.mail.send).toHaveBeenCalledTimes(0);
    });

    it('a new request invalidates the previous unused link', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);
        const first = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });
        const second = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        await expect(
            h.service.resetPassword({ token: first.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
        ).rejects.toThrow('Invalid or already used reset token.');
        await h.service.resetPassword({ token: second.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    });

    it('reset sets the new password, clears mustChangePassword, ends all sessions and is single-use', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23020',
            workspaceId: workspace.id,
            email: 'forgetful@bs23.test',
            mustChangePassword: true,
        });
        await h.service.login({ identifier: 'BS23020', password: PASSWORD });
        const forgot = await h.service.forgotPassword({ workEmail: 'forgetful@bs23.test' });

        await h.service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

        expect(h.db.rows('user').find((u) => u.userId === 'BS23020')?.mustChangePassword).toBe(false);
        expect(h.db.rows('session').every((s) => s.endedAt)).toBe(true);
        expect(h.db.rows('credential').find((c) => c.userId === 'BS23020')?.passwordChangedAt).toBeTruthy();
        await expect(h.service.login({ identifier: 'BS23020', password: PASSWORD })).rejects.toThrow(
            'Invalid credentials.',
        );
        await h.service.login({ identifier: 'BS23020', password: NEW_PASSWORD });

        await expect(
            h.service.resetPassword({ token: forgot.resetToken as string, newPassword: 'An0therPass!z3', confirmPassword: 'An0therPass!z3' }),
        ).rejects.toThrow('Invalid or already used reset token.');
    });

    it('rejects an expired, an unknown and a wrong-type token', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);
        const forgot = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        await expect(
            h.service.resetPassword({ token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
        ).rejects.toThrow('Invalid or already used reset token.');

        h.db.rows('authToken')[h.db.rows('authToken').length - 1].expiresAt = new Date(Date.now() - 1000);
        await expect(
            h.service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
        ).rejects.toThrow('Password reset token has expired.');
    });
});

describe('confirm password is checked by the API', () => {
    it('reset-password refuses a confirmation that differs and keeps the token usable', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);
        const forgot = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        await expect(
            h.service.resetPassword({
                token: forgot.resetToken as string,
                newPassword: NEW_PASSWORD,
                confirmPassword: 'Different-Passw0rd!',
            }),
        ).rejects.toThrow('Passwords do not match.');

        // The mismatch is checked before the token is spent.
        await h.service.resetPassword({
            token: forgot.resetToken as string,
            newPassword: NEW_PASSWORD,
            confirmPassword: NEW_PASSWORD,
        });
    });

    it('change-password refuses a confirmation that differs', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const [session] = h.db.rows('session');

        await expect(
            h.service.changePassword('USER', 'BS23001', workspace.id as string, session.id as string, {
                currentPassword: PASSWORD,
                newPassword: NEW_PASSWORD,
                confirmPassword: 'Different-Passw0rd!',
            }),
        ).rejects.toThrow('Passwords do not match.');
        // The old password still works: nothing was changed.
        await h.service.login({ identifier: 'BS23001', password: PASSWORD });
    });
});

describe('forgot-password is atomic', () => {
    it('keeps the previous link when storing the new one fails', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);
        const first = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });
        const create = h.db.authToken.create.bind(h.db.authToken);

        h.db.authToken.create = async () => {
            throw new Error('boom');
        };
        await expect(h.service.forgotPassword({ workEmail: 'pm001@bs23.test' })).rejects.toThrow('boom');
        h.db.authToken.create = create;

        expect(h.db.rows('authToken').filter((row) => !row.usedAt)).toHaveLength(1);
        await h.service.resetPassword({ token: first.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
    });
});

describe('notifications and outbox events for authentication (FR-14, FR-15)', () => {
    it('a password change notifies the account and writes auth.password_changed, in the same transaction', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const [session] = h.db.rows('session');

        await h.service.changePassword('USER', 'BS23001', workspace.id, session.id as string, {
            currentPassword: PASSWORD,
            newPassword: NEW_PASSWORD,
            confirmPassword: NEW_PASSWORD,
        });

        expect(login.user.id).toBe('BS23001');
        expect(h.db.rows('notification')).toMatchObject([
            { workspaceId: workspace.id, userId: 'BS23001', pmId: null, category: 'Account security' },
        ]);
        expect(h.db.rows('outboxEvent')).toMatchObject([
            {
                workspaceId: workspace.id,
                type: 'auth.password_changed',
                status: 'PENDING',
                payload: { accountRole: 'USER', accountId: 'BS23001' },
            },
        ]);

        // A failing outbox write undoes the password change.
        const create = h.db.outboxEvent.create.bind(h.db.outboxEvent);
        h.db.outboxEvent.create = async () => {
            throw new Error('boom');
        };
        await expect(
            h.service.changePassword('USER', 'BS23001', workspace.id, session.id as string, {
                currentPassword: NEW_PASSWORD,
                newPassword: 'Third-Passw0rd!z',
                confirmPassword: 'Third-Passw0rd!z',
            }),
        ).rejects.toThrow('boom');
        h.db.outboxEvent.create = create;
        await h.service.login({ identifier: 'BS23001', password: NEW_PASSWORD });
    });

    it('a password reset notifies the account and writes auth.password_reset_completed', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const { workspace } = await seedAccounts(h);
        const forgot = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });

        await h.service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

        expect(h.db.rows('notification')).toMatchObject([{ workspaceId: workspace.id, pmId: 'PM001', userId: null }]);
        expect(h.db.rows('outboxEvent')).toMatchObject([
            { type: 'auth.password_reset_completed', payload: { accountRole: 'PM', accountId: 'PM001' } },
        ]);
    });

    it('a failed login, an unsuccessful reset and a rejected token write no event', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        await expect(h.service.login({ identifier: 'BS23001', password: 'Wrong-Passw0rd!' })).rejects.toThrow();
        await expect(h.service.resetPassword({ token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).rejects.toThrow();

        expect(h.db.rows('outboxEvent')).toHaveLength(0);
        expect(h.db.rows('notification')).toHaveLength(0);
    });
});
