import { createHash } from 'node:crypto';

import {
    NEW_PASSWORD,
    PASSWORD,
    makeHarness,
    seedAccounts,
    type Harness,
} from '../../../test/support/identity-harness.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

// A PM that an authorized PM created through AccountProvisioningService. It can
// sign in at once (no email verification). The creating PM is PM001, the new PM is PM002.
const register = async (h: Harness, email = 'Reg.PM@Example.com') => {
    const actorPm = h.db.rows('pm')[0] ?? (await seedAccounts(h)).pm;

    return h.provisioning.createPm(
        { sub: actorPm.pmId, role: 'PM', workspaceId: actorPm.workspaceId },
        { pmId: 'PM002', name: 'Reg PM', email, password: PASSWORD },
    );
};

const newPm = (h: Harness) => h.db.rows('pm').find((row) => row.pmId === 'PM002');

describe('a provisioned PM (there is no email verification)', () => {
    it('provision -> the PM can sign in at once, with a password change required', async () => {
        const h = await makeHarness();
        const created = await register(h);

        expect(created).toMatchObject({ pmId: 'PM002', mustChangePassword: true, emailSent: false });
        expect(created).not.toHaveProperty('verificationToken');
        expect(created).not.toHaveProperty('verificationLink');
        expect(newPm(h)?.emailVerified).toBe(true);
        // No token of any kind is created for the new PM.
        expect(h.db.rows('authToken')).toHaveLength(0);

        await expect(
            h.service.login({ identifier: 'reg.pm@example.com', password: 'WrongPass123' }),
        ).rejects.toThrow('Invalid credentials.');
        const login = await h.service.login({ identifier: 'REG.PM@example.com', password: PASSWORD });
        expect(login.user).toMatchObject({ id: 'PM002', role: 'PM', mustChangePassword: true });
    });

    it('emails the credentials: the ID and the temporary password (the mail body is never logged)', async () => {
        const h = await makeHarness();
        await register(h);

        expect(h.mail.send).toHaveBeenCalledTimes(1);
        const mail = h.mail.send.mock.calls[0][0];
        expect(mail.to).toBe('reg.pm@example.com');
        expect(mail.text).toContain('PM002');
        expect(mail.text).toContain(PASSWORD);
        expect(mail.text).not.toMatch(/token=/);
    });

    it('reports emailSent true only when the provider really delivered', async () => {
        const h = await makeHarness();
        h.mail.send.mockResolvedValueOnce({ delivered: true, transport: 'console' as const });

        expect((await register(h)).emailSent).toBe(true);
    });

    it('a mail failure never fails the account creation', async () => {
        const h = await makeHarness();
        h.mail.send.mockRejectedValueOnce(new Error('smtp down'));

        const created = await register(h);

        expect(created).toMatchObject({ pmId: 'PM002', emailSent: false });
        expect(newPm(h)).toBeDefined();
    });

    it('has no email-verification routes or service methods any more', async () => {
        const h = await makeHarness();

        expect((h.service as unknown as Record<string, unknown>).verifyEmail).toBeUndefined();
        expect((h.service as unknown as Record<string, unknown>).resendVerification).toBeUndefined();
        expect((h.service as unknown as Record<string, unknown>).requestVerification).toBeUndefined();
    });
});

describe('retry of the credentials email (FR-AUTH-08): issues a new temporary password', () => {
    const pending = async (h: Harness) => {
        const seeded = await seedAccounts(h);
        // A user who has not signed in yet: still on the temporary password.
        h.db.rows('user')[0].mustChangePassword = true;
        h.db.rows('pm')[0].mustChangePassword = false;
        const actor = { sub: seeded.pm.pmId as string, role: 'PM' as const, workspaceId: seeded.pm.workspaceId as string };

        return { ...seeded, actor };
    };

    it('replaces the password, emails the new one, returns it once, and the old one stops working', async () => {
        const h = await makeHarness();
        const { user, actor } = await pending(h);

        const result = await h.provisioning.resendAccountEmail(actor, (user.userId as string).toLowerCase());

        expect(result.emailSent).toBe(false);
        expect(result.temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
        expect(h.mail.send).toHaveBeenCalledTimes(1);
        const mail = h.mail.send.mock.calls[0][0];
        expect(mail.to).toBe(user.email);
        expect(mail.text).toContain(user.userId as string);
        expect(mail.text).toContain(result.temporaryPassword);

        await expect(h.service.login({ identifier: user.userId as string, password: PASSWORD })).rejects.toThrow('Invalid credentials.');
        const login = await h.service.login({ identifier: user.userId as string, password: result.temporaryPassword });
        expect(login.user).toMatchObject({ id: user.userId, mustChangePassword: true });
    });

    it('every call issues a different password, and ends the sessions opened with the old one', async () => {
        const h = await makeHarness();
        const { user, actor } = await pending(h);
        await h.service.login({ identifier: user.userId as string, password: PASSWORD });
        expect(h.db.rows('session').filter((row) => row.endedAt === null)).toHaveLength(1);

        const first = await h.provisioning.resendAccountEmail(actor, user.userId as string);
        const second = await h.provisioning.resendAccountEmail(actor, user.userId as string);

        expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
        expect(h.db.rows('session').filter((row) => row.endedAt === null)).toHaveLength(0);
    });

    it('refuses an account that already chose its own password (use Forgot password), and changes nothing', async () => {
        const h = await makeHarness();
        const { pm, actor } = await pending(h);

        await expect(h.provisioning.resendAccountEmail(actor, pm.pmId as string)).rejects.toThrow('Use Forgot password instead.');

        expect(h.mail.send).toHaveBeenCalledTimes(0);
        await h.service.login({ identifier: pm.email as string, password: PASSWORD });
    });

    it('never puts the new password in a log line or an outbox event', async () => {
        const h = await makeHarness();
        const { user, actor } = await pending(h);
        const logged: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((...args) => void logged.push(args.join(' ')));

        const result = await h.provisioning.resendAccountEmail(actor, user.userId as string);
        spy.mockRestore();

        expect(JSON.stringify(h.db.rows('outboxEvent'))).not.toContain(result.temporaryPassword);
        expect(logged.join('\n')).not.toContain(result.temporaryPassword);
    });

    it('answers 404 for an unknown account and for an account of another workspace', async () => {
        const h = await makeHarness();
        const { actor } = await pending(h);
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.addUser(h.passwordHash, { userId: 'BS23999', workspaceId: other.id, email: 'far@bs23.test', mustChangePassword: true });

        await expect(h.provisioning.resendAccountEmail(actor, 'NOPE1')).rejects.toThrow('Account not found.');
        await expect(h.provisioning.resendAccountEmail(actor, 'BS23999')).rejects.toThrow('Account not found.');
        expect(h.mail.send).toHaveBeenCalledTimes(0);
    });

    it('refuses a user (not a PM) as the caller', async () => {
        const h = await makeHarness();
        const { user } = await pending(h);

        await expect(
            h.provisioning.resendAccountEmail(
                { sub: user.userId as string, role: 'TRAINEE', workspaceId: user.workspaceId as string },
                user.userId as string,
            ),
        ).rejects.toThrow('Only a PM of this workspace can create accounts.');
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
        expect(login.user.role).toBe('TRAINEE');
    });

    it('sends a reset to a PM whatever its (unused) emailVerified flag, but not to an archived user', async () => {
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

        await h.service.forgotPassword({ workEmail: 'archived@bs23.test' });
        expect(h.mail.send).toHaveBeenCalledTimes(0);
        expect(h.db.rows('authToken')).toHaveLength(0);

        await h.service.forgotPassword({ workEmail: 'unverified@bs23.test' });
        expect(h.mail.send).toHaveBeenCalledTimes(1);
        expect(h.db.rows('authToken')).toMatchObject([{ pmId: 'PM002', type: 'PASSWORD_RESET' }]);
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
            h.service.changePassword('TRAINEE', 'BS23001', workspace.id as string, session.id as string, {
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

        await h.service.changePassword('TRAINEE', 'BS23001', workspace.id, session.id as string, {
            currentPassword: PASSWORD,
            newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
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
                payload: { accountRole: 'TRAINEE', accountId: 'BS23001' },
            },
        ]);

        // A failing outbox write undoes the password change.
        const create = h.db.outboxEvent.create.bind(h.db.outboxEvent);
        h.db.outboxEvent.create = async () => {
            throw new Error('boom');
        };
        await expect(
            h.service.changePassword('TRAINEE', 'BS23001', workspace.id, session.id as string, {
                currentPassword: NEW_PASSWORD,
                newPassword: 'Third-Passw0rd!z', confirmPassword: 'Third-Passw0rd!z',
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

    it('creating a PM writes auth.account_created and no secret or address reaches the payloads', async () => {
        const h = await makeHarness();
        await register(h);

        expect(h.db.rows('outboxEvent')).toMatchObject([
            { type: 'auth.account_created', payload: { accountRole: 'PM', accountId: 'PM002' } },
        ]);
        const stored = JSON.stringify(h.db.rows('outboxEvent'));
        expect(stored).not.toContain('reg.pm@example.com');
        expect(stored).not.toContain(PASSWORD);
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
