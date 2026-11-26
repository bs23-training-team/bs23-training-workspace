import { createHash } from 'node:crypto';

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
} from '@nestjs/common';

import {
    NEW_PASSWORD,
    PASSWORD,
    decodePayload,
    makeHarness,
    seedAccounts,
    type Harness,
} from '../../../test/support/identity-harness.js';
import { normalizeEmail } from './email.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { classifyIdentifier } from './identifier.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const DAY_MS = 24 * 60 * 60 * 1000;

describe('normalizeEmail', () => {
    it('trims and lower-cases', () => {
        expect(normalizeEmail('  Name@Company.COM ')).toBe('name@company.com');
    });
});

describe('classifyIdentifier', () => {
    it('treats a value with "@" as an email, trimmed and lower-cased', () => {
        expect(classifyIdentifier('  PM@Company.com ')).toEqual({
            kind: 'EMAIL',
            value: 'pm@company.com',
        });
    });

    it('treats anything else as a Trainee ID, trimmed and upper-cased', () => {
        expect(classifyIdentifier(' bs23008 ')).toEqual({ kind: 'TRAINEE_ID', value: 'BS23008' });
    });
});

describe('IdentityService.login: PM (email + password, Pm model)', () => {
    it('signs a PM in and derives the PM role from the Pm table', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const result = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });

        expect(result.user).toMatchObject({ id: 'PM001', role: 'PM', mustChangePassword: false });
        expect(decodePayload(result.accessToken)).toMatchObject({
            sub: 'PM001',
            role: 'PM',
        });
        expect(decodePayload(result.accessToken)).toHaveProperty('sid');
    });

    it('matches the email case-insensitively and ignores surrounding spaces', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const result = await h.service.login({ identifier: '  PM001@BS23.Test ', password: PASSWORD });
        expect(result.user.id).toBe('PM001');
    });

    it('creates a Session row owned by the pm (pmId set, userId null) with the refresh hash', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const result = await h.service.login(
            { identifier: 'pm001@bs23.test', password: PASSWORD },
            'Firefox on Linux',
        );

        const [session] = h.db.rows('session');
        expect(session).toMatchObject({
            pmId: 'PM001',
            userId: null,
            device: 'Firefox on Linux',
            remembered: false,
            endedAt: null,
            tokenHash: sha256(result.refreshToken),
        });
        // The raw token is never stored.
        expect(JSON.stringify(h.db.rows('session'))).not.toContain(result.refreshToken);
    });

    it('rejects a PM ID as the login identifier (PMs sign in with email only)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        await expect(h.service.login({ identifier: 'PM001', password: PASSWORD })).rejects.toThrow(
            new UnauthorizedException('Invalid credentials.'),
        );
        expect(h.db.rows('session')).toHaveLength(0);
    });

    it('refuses an unverified PM only after the correct password (FR-AUTH-04)', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addPm(h.passwordHash, {
            pmId: 'PM002',
            workspaceId: workspace.id,
            email: 'new.pm@bs23.test',
            emailVerified: false,
        });

        await expect(
            h.service.login({ identifier: 'new.pm@bs23.test', password: 'WrongPass123' }),
        ).rejects.toThrow('Invalid credentials.');
        await expect(
            h.service.login({ identifier: 'new.pm@bs23.test', password: PASSWORD }),
        ).rejects.toThrow('Verify your email before signing in.');
        expect(h.db.rows('session')).toHaveLength(0);
    });

    it('fails closed on old data where one email belongs to PMs in two workspaces (new data cannot: the email is unique everywhere)', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        const other = h.db.addWorkspace({ slug: 'second' });
        h.db.enforceEmailTriggers = false; // rows from before the global-unique-email migration
        h.db.addPm(h.passwordHash, { pmId: 'PM002', workspaceId: other.id, email: 'pm001@bs23.test' });
        expect(workspace.id).not.toBe(other.id);

        await expect(
            h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD }),
        ).rejects.toThrow('Invalid credentials.');
        expect(h.db.rows('session')).toHaveLength(0);
    });
});

describe('IdentityService.login: user (Trainee ID + password, User.userId)', () => {
    it('signs a user in with their Trainee ID and derives the USER role', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const result = await h.service.login({ identifier: 'BS23001', password: PASSWORD });

        expect(result.user).toMatchObject({ id: 'BS23001', role: 'USER', resource: 'TRAINEE' });
        expect(decodePayload(result.accessToken)).toMatchObject({ sub: 'BS23001', role: 'USER' });
        expect(h.db.rows('session')[0]).toMatchObject({ userId: 'BS23001', pmId: null });
    });

    it('accepts the Trainee ID in lower case with spaces', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const result = await h.service.login({ identifier: '  bs23001 ', password: PASSWORD });
        expect(result.user.id).toBe('BS23001');
    });

    it('signs in every resource type as the login role USER (PRD: role "user")', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);

        const resources = ['CENTRAL_RND', 'INDUSTRIAL_ATTACHMENT', 'SBU'];
        for (const [index, resource] of resources.entries()) {
            h.db.addUser(h.passwordHash, {
                userId: `BS23${100 + index}`,
                workspaceId: workspace.id,
                email: `res${index}@bs23.test`,
                resource,
            });
        }

        for (const [index, resource] of resources.entries()) {
            const result = await h.service.login({
                identifier: `BS23${100 + index}`,
                password: PASSWORD,
            });
            expect(result.user).toMatchObject({ role: 'USER', resource });
        }
    });

    it('rejects a user signing in with their email (users sign in with their ID only)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        await expect(
            h.service.login({ identifier: 'bs23001@bs23.test', password: PASSWORD }),
        ).rejects.toThrow(new UnauthorizedException('Invalid credentials.'));
        expect(h.db.rows('session')).toHaveLength(0);
    });

    it('rejects an archived user, and a user past their departure date (FR-AUTH-06)', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23002',
            workspaceId: workspace.id,
            email: 'archived@bs23.test',
            archivedAt: new Date(),
        });
        h.db.addUser(h.passwordHash, {
            userId: 'BS23003',
            workspaceId: workspace.id,
            email: 'departed@bs23.test',
            departureDate: new Date(Date.now() - DAY_MS),
        });
        h.db.addUser(h.passwordHash, {
            userId: 'BS23004',
            workspaceId: workspace.id,
            email: 'leaving@bs23.test',
            departureDate: new Date(Date.now() + 30 * DAY_MS),
        });

        for (const id of ['BS23002', 'BS23003']) {
            await expect(h.service.login({ identifier: id, password: 'WrongPass123' })).rejects.toThrow(
                'Invalid credentials.',
            );
            await expect(h.service.login({ identifier: id, password: PASSWORD })).rejects.toThrow(
                'This account is inactive. Ask your PM to activate it.',
            );
        }

        const future = await h.service.login({ identifier: 'BS23004', password: PASSWORD });
        expect(future.user.id).toBe('BS23004');
    });

    it('does not require a verified email for users', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23005',
            workspaceId: workspace.id,
            email: 'unverified.user@bs23.test',
            emailVerified: false,
        });

        const result = await h.service.login({ identifier: 'BS23005', password: PASSWORD });
        expect(result.user.role).toBe('USER');
    });

    it('returns mustChangePassword for a temporary password (FR-AUTH-03)', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23006',
            workspaceId: workspace.id,
            email: 'temp@bs23.test',
            mustChangePassword: true,
        });

        const result = await h.service.login({ identifier: 'BS23006', password: PASSWORD });
        expect(result.user.mustChangePassword).toBe(true);
    });
});

describe('IdentityService.login: shared rules', () => {
    it('gives a wrong password and an unknown account the same message', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const attempts = [
            { identifier: 'BS23001', password: 'WrongPass123' },
            { identifier: 'BS23999', password: PASSWORD },
            { identifier: 'nobody@bs23.test', password: PASSWORD },
        ];

        for (const attempt of attempts) {
            await expect(h.service.login(attempt)).rejects.toThrow(
                new UnauthorizedException('Invalid credentials.'),
            );
        }
    });

    it('rejects an account that has no credential row', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.insert('user', {
            userId: 'BS23007',
            workspaceId: workspace.id,
            name: 'No Credential',
            email: 'nocred@bs23.test',
            resource: 'TRAINEE',
            pmId: 'PM001',
            position: 'BACKEND',
            attendanceMode: 'ONLINE',
            onboardDate: new Date(),
        });

        await expect(h.service.login({ identifier: 'BS23007', password: PASSWORD })).rejects.toThrow(
            'Invalid credentials.',
        );
    });

    it('a normal session lasts 7 days, a remembered one 30 days (FR-AUTH-01)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const normal = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const remembered = await h.service.login({
            identifier: 'BS23001',
            password: PASSWORD,
            rememberMe: true,
        });

        expect(normal.session.remembered).toBe(false);
        expect(remembered.session.remembered).toBe(true);

        const days = (date: Date) => Math.round((date.getTime() - Date.now()) / DAY_MS);
        expect(days(normal.session.expiresAt)).toBe(7);
        expect(days(remembered.session.expiresAt)).toBe(30);
    });

    it('stores "unknown" when the device is not sent, and caps a long device string', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        await h.service.login({ identifier: 'BS23001', password: PASSWORD }, 'x'.repeat(400));

        const devices = h.db.rows('session').map((s) => s.device as string);
        expect(devices[0]).toBe('unknown');
        expect(devices[1]).toHaveLength(255);
    });

    it('the access token is short-lived and the refresh token lasts as long as the session', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const { accessToken, refreshToken, session } = await h.service.login({
            identifier: 'BS23001',
            password: PASSWORD,
        });
        const access = decodePayload(accessToken) as { iat: number; exp: number };
        const refresh = decodePayload(refreshToken) as { exp: number; jti: string };

        expect(access.exp - access.iat).toBe(15 * 60);
        expect(refresh.jti).toBeTruthy();
        expect(Math.abs(refresh.exp - Math.floor(session.expiresAt.getTime() / 1000))).toBeLessThanOrEqual(2);
    });
});

describe('IdentityService.refresh', () => {
    async function signedIn(h: Harness, identifier = 'BS23001') {
        await seedAccounts(h);
        return h.service.login({ identifier, password: PASSWORD });
    }

    it('rotates the refresh token and keeps the same session and expiry', async () => {
        const h = await makeHarness();
        const first = await signedIn(h);

        const second = await h.service.refresh(first.refreshToken);

        expect(second.refreshToken).not.toBe(first.refreshToken);
        expect(second.user).toMatchObject({ id: 'BS23001', role: 'USER' });
        expect(second.session.expiresAt).toEqual(first.session.expiresAt);
        expect(h.db.rows('session')).toHaveLength(1);
        expect(h.db.rows('session')[0].tokenHash).toBe(sha256(second.refreshToken));
    });

    it('rotates again with the new token', async () => {
        const h = await makeHarness();
        const first = await signedIn(h);
        const second = await h.service.refresh(first.refreshToken);

        const third = await h.service.refresh(second.refreshToken);
        expect(third.accessToken).toBeTruthy();
    });

    it('treats a replayed (already rotated) token as theft and ends every session of that account', async () => {
        const h = await makeHarness();
        const first = await signedIn(h);
        const other = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        await h.service.refresh(first.refreshToken);

        await expect(h.service.refresh(first.refreshToken)).rejects.toThrow(
            'Invalid or expired refresh token.',
        );

        for (const row of h.db.rows('session')) {
            expect(row.endedAt).toBeTruthy();
        }
        await expect(h.service.refresh(other.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('does not touch the sessions of another account when a token is replayed', async () => {
        const h = await makeHarness();
        const trainee = await signedIn(h);
        const pm = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });
        await h.service.refresh(trainee.refreshToken);

        await expect(h.service.refresh(trainee.refreshToken)).rejects.toThrow(UnauthorizedException);

        const pmSession = h.db.rows('session').find((s) => s.pmId === 'PM001');
        expect(pmSession?.endedAt).toBe(null);
        expect((await h.service.refresh(pm.refreshToken)).user.role).toBe('PM');
    });

    it('rejects a logged-out session, an expired session and garbage', async () => {
        const h = await makeHarness();
        const first = await signedIn(h);
        const sid = decodePayload(first.refreshToken).sid as string;

        await h.service.logout(sid);
        await expect(h.service.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);

        const second = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        h.db.rows('session').find((s) => s.id === decodePayload(second.refreshToken).sid)!.expiresAt =
            new Date(Date.now() - 1000);
        await expect(h.service.refresh(second.refreshToken)).rejects.toThrow(UnauthorizedException);

        await expect(h.service.refresh('not-a-jwt')).rejects.toThrow(UnauthorizedException);
        await expect(h.service.refresh(first.accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it('ends the session when the user has since been archived', async () => {
        const h = await makeHarness();
        const first = await signedIn(h);
        h.db.rows('user')[0].archivedAt = new Date();

        await expect(h.service.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
        expect(h.db.rows('session')[0].endedAt).toBeTruthy();
    });
});

describe('IdentityService logout, sessions and me', () => {
    it('logout ends only the current session', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const a = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const b = await h.service.login({ identifier: 'BS23001', password: PASSWORD });

        const result = await h.service.logout(decodePayload(a.accessToken).sid as string);

        expect(result.message).toBe('Logged out successfully.');
        const rows = h.db.rows('session');
        expect(rows.filter((s) => s.endedAt)).toHaveLength(1);
        expect((await h.service.refresh(b.refreshToken)).accessToken).toBeTruthy();
    });

    it('lists only the live sessions of the signed-in account and marks the current one', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const a = await h.service.login({ identifier: 'BS23001', password: PASSWORD }, 'Laptop');
        const b = await h.service.login({ identifier: 'BS23001', password: PASSWORD }, 'Phone');
        await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD }, 'PM laptop');
        await h.service.logout(decodePayload(b.accessToken).sid as string);

        const { sessions } = await h.service.listSessions(
            'USER',
            'BS23001',
            decodePayload(a.accessToken).sid as string,
        );

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({ device: 'Laptop', current: true });
        expect(JSON.stringify(sessions)).not.toContain('tokenHash');
    });

    it('revokes one of your own sessions, but not someone else\'s', async () => {
        const h = await makeHarness();
        const { user } = await seedAccounts(h);
        const mine = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const pm = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });
        const mySid = decodePayload(mine.accessToken).sid as string;
        const pmSid = decodePayload(pm.accessToken).sid as string;

        await expect(
            h.service.revokeSession('USER', 'BS23001', user.workspaceId as string, pmSid),
        ).rejects.toThrow(NotFoundException);
        expect(h.db.rows('session').find((s) => s.id === pmSid)?.endedAt).toBe(null);

        await h.service.revokeSession('USER', 'BS23001', user.workspaceId as string, mySid);
        expect(h.db.rows('session').find((s) => s.id === mySid)?.endedAt).toBeTruthy();
    });

    it('me returns the PM or the user from the right table, without secrets', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        const pm = await h.service.me('PM', 'PM001');
        const user = await h.service.me('USER', 'BS23001');

        expect(pm.user).toMatchObject({ id: 'PM001', role: 'PM', emailVerified: true });
        expect(user.user).toMatchObject({
            id: 'BS23001',
            role: 'USER',
            resource: 'TRAINEE',
            pmId: 'PM001',
        });
        expect(JSON.stringify([pm, user])).not.toContain('passwordHash');
        await expect(h.service.me('PM', 'PM999')).rejects.toThrow(UnauthorizedException);
    });
});

describe('IdentityService.changePassword (FR-AUTH-03)', () => {
    it('changes a user\'s password, clears mustChangePassword and keeps only the current session', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23010',
            workspaceId: workspace.id,
            email: 'first.login@bs23.test',
            mustChangePassword: true,
        });
        const current = await h.service.login({ identifier: 'BS23010', password: PASSWORD });
        await h.service.login({ identifier: 'BS23010', password: PASSWORD });

        await h.service.changePassword(
            'USER',
            'BS23010',
            workspace.id as string,
            decodePayload(current.accessToken).sid as string,
            { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
        );

        expect(h.db.rows('user').find((u) => u.userId === 'BS23010')?.mustChangePassword).toBe(false);
        expect(h.db.rows('session').filter((s) => s.endedAt === null)).toHaveLength(1);
        const credential = h.db.rows('credential').find((c) => c.userId === 'BS23010');
        expect(credential?.passwordChangedAt).toBeTruthy();

        await expect(h.service.login({ identifier: 'BS23010', password: PASSWORD })).rejects.toThrow(
            'Invalid credentials.',
        );
        expect((await h.service.login({ identifier: 'BS23010', password: NEW_PASSWORD })).user.id).toBe(
            'BS23010',
        );
    });

    it('changes a PM\'s password through the Pm credential', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.rows('pm')[0].mustChangePassword = true;

        await h.service.changePassword('PM', 'PM001', workspace.id as string, 'no-session', {
            currentPassword: PASSWORD,
            newPassword: NEW_PASSWORD,
            confirmPassword: NEW_PASSWORD,
        });

        expect(h.db.rows('pm')[0].mustChangePassword).toBe(false);
        expect(
            (await h.service.login({ identifier: 'pm001@bs23.test', password: NEW_PASSWORD })).user.role,
        ).toBe('PM');
    });

    it('rejects a wrong current password and an unchanged password', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        const call = (currentPassword: string, newPassword: string) =>
            h.service.changePassword('USER', 'BS23001', workspace.id as string, 's', {
                currentPassword,
                newPassword,
                confirmPassword: newPassword,
            });

        await expect(call('WrongPass123', NEW_PASSWORD)).rejects.toThrow('Current password is incorrect.');
        await expect(call(PASSWORD, PASSWORD)).rejects.toThrow(BadRequestException);
    });
});

function makeGuard(h: Harness, allowMustChange = false) {
    const reflector = { getAllAndOverride: () => allowMustChange };
    const guard = new JwtAuthGuard(h.jwt, h.config, h.db as never, reflector as never);

    return async (token?: string) => {
        const request: Record<string, any> = {
            headers: token ? { authorization: `Bearer ${token}` } : {},
        };
        const context = {
            getHandler: () => undefined,
            getClass: () => undefined,
            switchToHttp: () => ({ getRequest: () => request }),
        };
        await guard.canActivate(context as never);
        return request;
    };
}

describe('JwtAuthGuard (protected routes)', () => {
    it('lets a signed-in user through and sets request.user from the database', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });

        const request = await makeGuard(h)(login.accessToken);

        expect(request.user).toMatchObject({ sub: 'BS23001', role: 'USER', workspaceId: expect.any(String) });
    });

    it('lets a signed-in PM through with the PM role', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });

        expect((await makeGuard(h)(login.accessToken)).user.role).toBe('PM');
    });

    it('rejects a missing header, a bad token and a refresh token used as an access token', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const run = makeGuard(h);

        await expect(run(undefined)).rejects.toThrow('Access token is required.');
        await expect(run('garbage')).rejects.toThrow(UnauthorizedException);
        await expect(run(login.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects the access token as soon as the session is logged out (no wait for expiry)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const run = makeGuard(h);
        await run(login.accessToken);

        await h.service.logout(decodePayload(login.accessToken).sid as string);

        await expect(run(login.accessToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a user archived or departed after signing in (FR-AUTH-06: checked every request)', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const run = makeGuard(h);
        await run(login.accessToken);

        // The departure date is today: still active (it has not PASSED yet).
        h.db.rows('user')[0].departureDate = new Date(Date.now() - 1000);
        await run(login.accessToken);

        // Two days ago: it has passed. The next request is refused with the
        // PRD wording and the session is ended (US-06).
        h.db.rows('user')[0].departureDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        await expect(run(login.accessToken)).rejects.toThrow(
            'This account is inactive. Ask your PM to activate it.',
        );
        expect(h.db.rows('session').every((row) => row.endedAt)).toBe(true);
        await expect(run(login.accessToken)).rejects.toThrow('Invalid or expired access token.');
    });

    it('rejects a token whose subject does not match the session owner', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const trainee = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const sid = decodePayload(trainee.accessToken).sid as string;
        const forged = await h.jwt.signAsync(
            { sub: 'PM001', sid, workspaceId: 'x', role: 'PM' },
            { secret: 'a'.repeat(40), expiresIn: 60 },
        );

        await expect(makeGuard(h)(forged)).rejects.toThrow(UnauthorizedException);
    });

    it('takes the role from the database, not from the token payload', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const trainee = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const sid = decodePayload(trainee.accessToken).sid as string;
        const claimsPm = await h.jwt.signAsync(
            { sub: 'BS23001', sid, workspaceId: 'x', role: 'PM' },
            { secret: 'a'.repeat(40), expiresIn: 60 },
        );

        expect((await makeGuard(h)(claimsPm)).user.role).toBe('USER');
    });

    it('blocks every route except the opted-out ones while mustChangePassword is set', async () => {
        const h = await makeHarness();
        const { workspace } = await seedAccounts(h);
        h.db.addUser(h.passwordHash, {
            userId: 'BS23011',
            workspaceId: workspace.id,
            email: 'temp@bs23.test',
            mustChangePassword: true,
        });
        const login = await h.service.login({ identifier: 'BS23011', password: PASSWORD });

        await expect(makeGuard(h, false)(login.accessToken)).rejects.toThrow(ForbiddenException);
        expect((await makeGuard(h, true)(login.accessToken)).user.sub).toBe('BS23011');
    });

    it('rejects an unverified PM even with a live session', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });
        h.db.rows('pm')[0].emailVerified = false;

        await expect(makeGuard(h)(login.accessToken)).rejects.toThrow(UnauthorizedException);
    });
});

describe('RolesGuard (backend role enforcement)', () => {
    const run = (allowed: Array<'PM' | 'USER'> | undefined, userRole?: 'PM' | 'USER') => {
        const guard = new RolesGuard({ getAllAndOverride: () => allowed } as never);
        const context = {
            getHandler: () => undefined,
            getClass: () => undefined,
            switchToHttp: () => ({ getRequest: () => ({ user: userRole ? { role: userRole } : undefined }) }),
        };
        return () => guard.canActivate(context as never);
    };

    it('lets a PM into PM-only routes and blocks a Trainee', () => {
        expect(run(['PM'], 'PM')()).toBe(true);
        expect(run(['PM'], 'USER')).toThrow(ForbiddenException);
    });

    it('lets a Trainee into Trainee-only routes and blocks a PM', () => {
        expect(run(['USER'], 'USER')()).toBe(true);
        expect(run(['USER'], 'PM')).toThrow(ForbiddenException);
    });

    it('blocks a request with no authenticated user', () => {
        expect(run(['PM'], undefined)).toThrow(ForbiddenException);
    });

    it('allows routes that list no roles', () => {
        expect(run(undefined, 'USER')()).toBe(true);
    });
});
