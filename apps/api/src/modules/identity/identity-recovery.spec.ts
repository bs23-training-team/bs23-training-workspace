import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';

import {
    NEW_PASSWORD,
    PASSWORD,
    makeHarness,
    seedAccounts,
    type Harness,
} from '../../../test/support/identity-harness.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// The body a client would receive from the HttpException the call throws.
async function responseOf(call: Promise<unknown>) {
    try {
        await call;
    } catch (error) {
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }
    throw new Error('expected the call to throw');
}

// A PM that an authorized PM created through AccountProvisioningService: it
// starts unverified, with an emailed (dev-exposed) verification token. The
// creating PM is PM001, the new PM is PM002.
const register = async (h: Harness, email = 'Reg.PM@Example.com') => {
    const actorPm = h.db.rows('pm')[0] ?? (await seedAccounts(h)).pm;

    return h.provisioning.createPm(
        { sub: actorPm.pmId, role: 'PM', workspaceId: actorPm.workspaceId },
        { pmId: 'PM002', name: 'Reg PM', email, password: PASSWORD },
    );
};

const newPm = (h: Harness) => h.db.rows('pm').find((row) => row.pmId === 'PM002');

describe('email verification of a provisioned PM (FR-AUTH-04)', () => {
    it('provision -> refused sign-in -> verify -> sign-in works', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);

        await expect(
            h.service.login({ identifier: 'reg.pm@example.com', password: 'WrongPass123' }),
        ).rejects.toThrow('Invalid credentials.');
        await expect(
            h.service.login({ identifier: 'reg.pm@example.com', password: PASSWORD }),
        ).rejects.toThrow('Verify your email before signing in.');

        const verified = await h.service.verifyEmail({ token: reg.verificationToken as string });
        expect(verified.message).toContain('verified');
        expect(newPm(h)?.emailVerified).toBe(true);

        const login = await h.service.login({ identifier: 'REG.PM@example.com', password: PASSWORD });
        expect(login.user).toMatchObject({ id: 'PM002', role: 'PM', mustChangePassword: true });
    });

    it('the link works once', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);
        await h.service.verifyEmail({ token: reg.verificationToken as string });

        const body = await responseOf(h.service.verifyEmail({ token: reg.verificationToken as string }));
        expect(body.code).toBe('VERIFICATION_LINK_INVALID');
    });

    it('an unknown token is "invalid", an expired one is "expired" (distinct errors)', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);

        expect((await responseOf(h.service.verifyEmail({ token: 'f'.repeat(64) }))).code).toBe(
            'VERIFICATION_LINK_INVALID',
        );

        h.db.rows('authToken')[h.db.rows('authToken').length - 1].expiresAt = new Date(Date.now() - 1000);
        const expired = await responseOf(h.service.verifyEmail({ token: reg.verificationToken as string }));
        expect(expired.code).toBe('VERIFICATION_LINK_EXPIRED');
        expect(newPm(h)?.emailVerified).toBe(false);
    });

    it('a password-reset token cannot verify an email, and the other way round', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        await seedAccounts(h);
        const forgot = await h.service.forgotPassword({ workEmail: 'pm001@bs23.test' });
        const reg = await register(h);
        // seedAccounts ran once above; register reuses that workspace and PM.

        expect(
            (await responseOf(h.service.verifyEmail({ token: forgot.resetToken as string }))).code,
        ).toBe('VERIFICATION_LINK_INVALID');
        await expect(
            h.service.resetPassword({ token: reg.verificationToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
        ).rejects.toThrow('Invalid or already used reset token.');
    });

    it('an expired link can be replaced, and the old link then stops working', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);
        h.db.rows('authToken')[h.db.rows('authToken').length - 1].expiresAt = new Date(Date.now() - 1000);

        const resent = await h.service.resendVerification({ token: reg.verificationToken as string });

        expect(resent.verificationToken).not.toBe(reg.verificationToken);
        expect(h.mail.send).toHaveBeenCalledTimes(2);
        expect((await responseOf(h.service.verifyEmail({ token: reg.verificationToken as string }))).code).toBe(
            'VERIFICATION_LINK_INVALID',
        );
        await h.service.verifyEmail({ token: resent.verificationToken as string });
        expect(newPm(h)?.emailVerified).toBe(true);
    });

    it('refuses to resend while the link is still valid, and after verification', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);

        await expect(
            h.service.resendVerification({ token: reg.verificationToken as string }),
        ).rejects.toThrow('This verification link is still valid.');

        await h.service.verifyEmail({ token: reg.verificationToken as string });
        expect(
            (await responseOf(h.service.resendVerification({ token: reg.verificationToken as string }))).code,
        ).toBe('VERIFICATION_LINK_INVALID');
    });
});

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

    it('does not send a reset to an unverified PM or an archived user', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addPm(h.passwordHash, {
            pmId: 'PM002',
            workspaceId: workspace.id,
            email: 'unverified@bs23.test',
            emailVerified: false,
        });
        h.db.addUser(h.passwordHash, {
            userId: 'BS23002',
            workspaceId: workspace.id,
            email: 'archived@bs23.test',
            archivedAt: new Date(),
        });

        await h.service.forgotPassword({ workEmail: 'unverified@bs23.test' });
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

describe('requesting a new verification link by email (a PM who never got one)', () => {
    it('sends a fresh link to an unverified PM, invalidates the old one, and the new link verifies', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);
        h.mail.send.mockClear();

        const requested = await h.service.requestVerification({ email: 'REG.pm@example.com' });

        expect(h.mail.send).toHaveBeenCalledTimes(1);
        expect(h.mail.send.mock.calls[0][0].to).toBe('reg.pm@example.com');
        expect(requested.verificationToken).toBeDefined();
        expect(requested.verificationToken).not.toBe(reg.verificationToken);

        // The first link no longer works, the new one does.
        const old = await responseOf(h.service.verifyEmail({ token: reg.verificationToken as string }));
        expect(old.code).toBe('VERIFICATION_LINK_INVALID');
        await h.service.verifyEmail({ token: requested.verificationToken as string });
        expect(newPm(h)?.emailVerified).toBe(true);
    });

    it('answers identically for an unknown email, a verified PM, a trainee and an ambiguous email, and sends nothing', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const { workspace } = await seedAccounts(h);
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.enforceEmailTriggers = false; // rows from before the global-unique-email migration
        h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'dup@example.com', emailVerified: false });
        h.db.addPm('hash', { pmId: 'PM051', workspaceId: workspace.id, email: 'DUP@example.com', emailVerified: false });
        h.mail.send.mockClear();

        const answers = [];
        for (const email of ['nobody@example.com', 'pm001@bs23.test', 'bs23001@bs23.test', 'dup@example.com']) {
            answers.push(await h.service.requestVerification({ email }));
        }

        expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
        expect(h.mail.send).not.toHaveBeenCalled();
        expect(h.db.rows('authToken')).toHaveLength(0);
    });

    it('never returns the token outside the dev flag, and only the hash is stored', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'false' });
        await register(h);

        const requested = await h.service.requestVerification({ email: 'reg.pm@example.com' });

        expect(Object.keys(requested)).toEqual(['message']);
        const mailed = /token=([0-9a-f]{64})/.exec(h.mail.send.mock.calls.at(-1)![0].text)![1];
        expect(JSON.stringify(h.db.rows('authToken'))).not.toContain(mailed);
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

    it('email verification writes auth.email_verified and no secret or address reaches the payloads', async () => {
        const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
        const reg = await register(h);
        h.db.rows('notification').length = 0;
        h.db.rows('outboxEvent').length = 0;

        await h.service.verifyEmail({ token: reg.verificationToken as string });

        expect(h.db.rows('outboxEvent')).toMatchObject([
            { type: 'auth.email_verified', payload: { accountRole: 'PM', accountId: 'PM002' } },
        ]);
        const stored = JSON.stringify(h.db.rows('outboxEvent'));
        expect(stored).not.toContain(reg.verificationToken as string);
        expect(stored).not.toContain('reg.pm@example.com');
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
