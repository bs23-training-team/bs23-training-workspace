/**
 * Route-level tests: real HTTP requests (supertest) through the REAL
 * IdentityController, the REAL JwtAuthGuard / RolesGuard / RateLimitGuard and
 * the real ValidationPipe, with the real services on the in-memory database
 * (test/support/identity-fake-prisma.ts, not Prisma).
 *
 * Needs @nestjs/testing, @nestjs/platform-express and supertest (all already
 * in apps/api devDependencies). Each test uses its own client IP (the app
 * trusts X-Forwarded-For here) so the in-memory rate-limit counters do not
 * leak between tests.
 */

import { ConfigService } from '@nestjs/config';
import { Controller, Get, UseGuards, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service.js';
import {
    NEW_PASSWORD,
    PASSWORD,
    makeHarness,
    seedAccounts,
} from '../../../test/support/identity-harness.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/access.decorators.js';

const TEMP = 'Temp0rary!pw1';

const isoDay = (daysFromNow: number) =>
    new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

// Stand-ins for routes other squads will protect with the exported guards:
// they prove that PM-only / Trainee-only enforcement and the first-login block
// work through the real JwtAuthGuard + RolesGuard on a real HTTP request.
@Controller('guard-probe')
class GuardProbeController {
    @Get('pm-only')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('PM')
    pmOnly() {
        return { ok: true };
    }

    @Get('trainee-only')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('USER')
    traineeOnly() {
        return { ok: true };
    }
}

let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

async function makeApp(env: Record<string, string> = {}) {
    const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true', ...env });
    const seeded = await seedAccounts(h);
    const team = h.db.addTeam({ workspaceId: seeded.workspace.id, pmId: seeded.pm.pmId });

    const moduleRef = await Test.createTestingModule({
        controllers: [IdentityController, GuardProbeController],
        providers: [
            { provide: IdentityService, useValue: h.service },
            { provide: AccountProvisioningService, useValue: h.provisioning },
            { provide: JwtService, useValue: h.jwt },
            { provide: ConfigService, useValue: h.config },
            { provide: PrismaService, useValue: h.db },
            JwtAuthGuard,
            RolesGuard,
            RateLimitGuard,
        ],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', true);
    await app.init();

    const send = (
        method: 'get' | 'post' | 'delete',
        path: string,
        options: { ip?: string; token?: string; body?: object } = {},
    ) => {
        let req = request(app.getHttpServer())[method](path).set('X-Forwarded-For', options.ip ?? nextIp());
        if (options.token) req = req.set('Authorization', `Bearer ${options.token}`);
        return options.body ? req.send(options.body) : req;
    };

    const login = async (identifier: string, password = PASSWORD) =>
        (await send('post', '/auth/login', { body: { identifier, password } })).body as {
            accessToken: string;
            refreshToken: string;
        };

    return { app, h, send, login, team, ...seeded };
}

describe('auth routes through the real controller and guards', () => {
    let ctx: Awaited<ReturnType<typeof makeApp>>;

    // Generous login limits: this block is about authorization, not throttling.
    beforeAll(async () => {
        ctx = await makeApp({
            AUTH_RATE_LIMIT_LOGIN_MAX: '1000',
            AUTH_RATE_LIMIT_LOGIN_IP_MAX: '1000',
            AUTH_RATE_LIMIT_ACCOUNT_PROVISION_MAX: '1000',
        });
    });
    afterAll(async () => {
        await ctx.app.close();
    });

    it('PM logs in with email, Trainee with Trainee ID; trainee email, PM ID, wrong password and unknown account all get the same generic 401', async () => {
        const { send } = ctx;

        const pm = await send('post', '/auth/login', { body: { identifier: 'PM001@bs23.test', password: PASSWORD } });
        const trainee = await send('post', '/auth/login', { body: { identifier: 'bs23001', password: PASSWORD } });
        expect(pm.status).toBe(200);
        expect(pm.body.user).toMatchObject({ id: 'PM001', role: 'PM' });
        expect(trainee.status).toBe(200);
        expect(trainee.body.user).toMatchObject({ id: 'BS23001', role: 'USER' });
        expect(JSON.stringify(pm.body)).not.toMatch(/passwordHash|tokenHash/);

        for (const body of [
            { identifier: 'bs23001@bs23.test', password: PASSWORD },
            { identifier: 'PM001', password: PASSWORD },
            { identifier: 'pm001@bs23.test', password: 'Wrong-Passw0rd' },
            { identifier: 'nobody@bs23.test', password: PASSWORD },
        ]) {
            const res = await send('post', '/auth/login', { body });
            expect(res.status).toBe(401);
            expect(res.body.message).toBe('Invalid credentials.');
        }
    });

    it('rejects a missing or oversized login field with 400 and issues no token', async () => {
        const { send } = ctx;

        for (const body of [{ identifier: 'pm001@bs23.test' }, { password: PASSWORD }, { identifier: 'a@b.co', password: 'x'.repeat(129) }, {}]) {
            const res = await send('post', '/auth/login', { body });
            expect(res.status).toBe(400);
            expect(res.body.accessToken).toBeUndefined();
        }
    });

    it('/auth/me: no token, garbage, expired and revoked tokens are 401; a valid token is 200', async () => {
        const { send, login, h } = ctx;
        const session = await login('bs23001');

        expect((await send('get', '/auth/me')).status).toBe(401);
        expect((await send('get', '/auth/me', { token: 'not.a.jwt' })).status).toBe(401);

        const payload = JSON.parse(Buffer.from(session.accessToken.split('.')[1], 'base64url').toString());
        const expired = await h.jwt.signAsync(
            { sub: payload.sub, sid: payload.sid, workspaceId: payload.workspaceId, role: payload.role },
            { secret: 'a'.repeat(40), algorithm: 'HS256', expiresIn: -10 },
        );
        expect((await send('get', '/auth/me', { token: expired })).status).toBe(401);

        const me = await send('get', '/auth/me', { token: session.accessToken });
        expect(me.status).toBe(200);
        expect(me.body.user).toMatchObject({ id: 'BS23001', role: 'USER' });

        expect((await send('post', '/auth/logout', { token: session.accessToken })).status).toBe(200);
        expect((await send('get', '/auth/me', { token: session.accessToken })).status).toBe(401);
        expect((await send('post', '/auth/refresh', { body: { refreshToken: session.refreshToken } })).status).toBe(401);
    });

    it('refresh rotates the token; replaying the old one is 401 and ends every session of the account', async () => {
        const { send, login } = ctx;
        const first = await login('pm001@bs23.test');

        const second = await send('post', '/auth/refresh', { body: { refreshToken: first.refreshToken } });
        expect(second.status).toBe(200);
        expect(second.body.refreshToken).not.toBe(first.refreshToken);

        expect((await send('post', '/auth/refresh', { body: { refreshToken: first.refreshToken } })).status).toBe(401);
        expect((await send('get', '/auth/me', { token: second.body.accessToken })).status).toBe(401);
    });

    it('a Trainee cannot use PM-only routes (403); no token is 401; a client-supplied role changes nothing', async () => {
        const { send, login, team } = ctx;
        const trainee = await login('BS23001');
        const addPm = { pmId: 'PM800001', name: 'X', email: 'x1@example.test', password: TEMP };
        const addTrainee = {
            userId: 'BS238001', name: 'X', email: 'x2@example.test', temporaryPassword: TEMP,
            position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: isoDay(300),
            skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [team.id],
        };

        for (const [path, body] of [
            ['/auth/accounts/pms', addPm],
            ['/auth/accounts/trainees', addTrainee],
        ] as const) {
            expect((await send('post', path, { token: trainee.accessToken, body })).status).toBe(403);
            expect((await send('post', path, { body })).status).toBe(401);
            // Claiming to be a PM in the body or in a header does not help.
            const forged = await send('post', path, { token: trainee.accessToken, body: { ...body, role: 'PM' } }).set('x-role', 'PM');
            expect(forged.status).toBe(403);
        }
    });

    it('PM-only and Trainee-only routes are enforced by the role in the database (guard probes)', async () => {
        const { send, login } = ctx;
        const pm = await login('pm001@bs23.test');
        const trainee = await login('BS23001');

        expect((await send('get', '/guard-probe/pm-only', { token: pm.accessToken })).status).toBe(200);
        expect((await send('get', '/guard-probe/pm-only', { token: trainee.accessToken })).status).toBe(403);
        expect((await send('get', '/guard-probe/trainee-only', { token: trainee.accessToken })).status).toBe(200);
        expect((await send('get', '/guard-probe/trainee-only', { token: pm.accessToken })).status).toBe(403);
        expect((await send('get', '/guard-probe/trainee-only')).status).toBe(401);
    });

    it('Add PM (HTTP): 201 in the caller workspace, body workspace/role ignored; duplicates 409; weak or missing password 400', async () => {
        const { send, login, h, workspace } = ctx;
        const pm = await login('pm001@bs23.test');
        const other = h.db.addWorkspace({ slug: 'someone-else' });

        const created = await send('post', '/auth/accounts/pms', {
            token: pm.accessToken,
            body: { pmId: 'PM800002', name: 'Added PM', email: 'Added.PM@Example.test', password: TEMP, workspaceId: other.id, role: 'USER' },
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ pmId: 'PM800002', workspaceId: workspace.id, emailVerified: false, mustChangePassword: true });
        expect(JSON.stringify(created.body)).not.toMatch(new RegExp(`${TEMP}|passwordHash`));

        const dup = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800003', name: 'D', email: 'added.pm@example.test', password: TEMP } });
        expect(dup.status).toBe(409);
        const weak = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800004', name: 'W', email: 'w@example.test', password: 'short' } });
        expect(weak.status).toBe(400);
        // There is no invitation mode: a missing password is a 400, not an invitation.
        const none = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800006', name: 'N', email: 'n@example.test' } });
        expect(none.status).toBe(400);

        // The new PM cannot sign in until the link is used, and is then limited to the password change.
        expect((await send('post', '/auth/login', { body: { identifier: 'added.pm@example.test', password: TEMP } })).status).toBe(401);
        const verified = await send('post', '/auth/email/verify', { body: { token: created.body.verificationToken } });
        expect(verified.status).toBe(200);
        expect((await send('post', '/auth/email/verify', { body: { token: created.body.verificationToken } })).status).toBe(400);
        const newPm = await login('added.pm@example.test', TEMP);
        const blocked = await send('post', '/auth/accounts/pms', {
            token: newPm.accessToken,
            body: { pmId: 'PM800005', name: 'Z', email: 'z@example.test', password: TEMP },
        });
        expect(blocked.status).toBe(403);
    });

    it('Add Trainee (HTTP): 201, active at once, managed by the caller; first login forces the password change; duplicates 409; foreign team 400', async () => {
        const { send, login, h, team, workspace, pm } = ctx;
        const caller = await login('pm001@bs23.test');
        const body = {
            userId: 'bs238010', name: 'New Trainee', email: 'new.trainee@example.test', temporaryPassword: TEMP,
            position: 'BACKEND', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: isoDay(300),
            skillAssessmentMinutes: 60, skillAssessmentMarks: 100, teamIds: [team.id],
        };
        h.mail.send.mockClear();

        const created = await send('post', '/auth/accounts/trainees', { token: caller.accessToken, body });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ userId: 'BS238010', workspaceId: workspace.id, pmId: pm.pmId, active: true, mustChangePassword: true, teamIds: [team.id] });
        expect(JSON.stringify(created.body)).not.toContain(TEMP);
        expect(h.mail.send).not.toHaveBeenCalled();

        // First login: signs in with the Trainee ID and the temporary password ...
        const signedIn = await send('post', '/auth/login', { body: { identifier: 'BS238010', password: TEMP } });
        expect(signedIn.status).toBe(200);
        expect(signedIn.body.user).toMatchObject({ role: 'USER', mustChangePassword: true });
        expect((await send('post', '/auth/login', { body: { identifier: 'new.trainee@example.test', password: TEMP } })).status).toBe(401);

        // ... every route except the first-login ones is blocked until the password is changed ...
        const token = signedIn.body.accessToken as string;
        const probe = await send('get', '/guard-probe/trainee-only', { token });
        expect(probe.status).toBe(403);
        expect(probe.body.message).toBe('You must change your password before continuing.');
        expect((await send('get', '/auth/me', { token })).status).toBe(200);

        // ... and the change unlocks it, with the temporary password no longer valid.
        const changed = await send('post', '/auth/password/change', { token, body: { currentPassword: TEMP, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } });
        expect(changed.status).toBe(200);
        expect((await send('get', '/guard-probe/trainee-only', { token })).status).toBe(200);
        expect((await send('post', '/auth/login', { body: { identifier: 'BS238010', password: TEMP } })).status).toBe(401);
        expect((await send('post', '/auth/login', { body: { identifier: 'BS238010', password: NEW_PASSWORD } })).body.user.mustChangePassword).toBe(false);

        const bad = async (patch: object, status: number) =>
            expect((await send('post', '/auth/accounts/trainees', { token: caller.accessToken, body: { ...body, userId: 'BS238011', email: 'b@example.test', ...patch } })).status).toBe(status);
        await bad({ position: 'DESIGNER' }, 400);
        await bad({ attendanceMode: 'HYBRID' }, 400);
        await bad({ teamIds: [] }, 400);
        await bad({ onboardDate: '2026-13-01' }, 400);
        await bad({ departureDate: undefined }, 400);
        await bad({ skillAssessmentMinutes: 500 }, 400);
        await bad({ skillAssessmentMinutes: undefined }, 400);
        await bad({ skillAssessmentMarks: undefined }, 400);
        await bad({ temporaryPassword: 'short' }, 400);
        await bad({ temporaryPassword: undefined }, 400);
        await bad({ userId: 'BS238010' }, 409);
        await bad({ email: 'new.trainee@example.test' }, 409);

        const other = h.db.addWorkspace({ slug: 'foreign-ws' });
        const foreignTeam = h.db.addTeam({ workspaceId: other.id, pmId: 'PM777', name: 'Foreign' });
        await bad({ teamIds: [foreignTeam.id] }, 400);
    });

    it('PM scope over HTTP: a PM cannot put a trainee into another PM\'s team, and a body pmId/workspaceId is ignored', async () => {
        const { send, login, h, team, workspace } = ctx;
        h.db.addPm(h.passwordHash, { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
        const second = await login('pm002@bs23.test');
        const body = {
            userId: 'BS238030', name: 'Scoped', email: 'scoped@example.test', temporaryPassword: TEMP,
            position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: isoDay(300),
            skillAssessmentMinutes: 30, skillAssessmentMarks: 50,
        };

        // team.pmId is PM001: PM002 gets the same answer as for an unknown team.
        const foreign = await send('post', '/auth/accounts/trainees', { token: second.accessToken, body: { ...body, teamIds: [team.id] } });
        const unknown = await send('post', '/auth/accounts/trainees', { token: second.accessToken, body: { ...body, teamIds: ['no-such-team'] } });
        expect(foreign.status).toBe(400);
        expect(foreign.body.message).toBe(unknown.body.message);

        const own = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM002', name: 'PM002 team' });
        const ok = await send('post', '/auth/accounts/trainees', {
            token: second.accessToken,
            body: { ...body, teamIds: [own.id], pmId: 'PM001', workspaceId: 'x' },
        });
        expect(ok.status).toBe(201);
        expect(ok.body.pmId).toBe('PM002');
        expect(h.db.rows('user').find((row) => row.userId === 'BS238030')?.pmId).toBe('PM002');
    });

    it('invitation routes do not exist (404): the approved schema cannot separate them from password reset', async () => {
        const { send, login } = ctx;
        const pm = await login('pm001@bs23.test');

        expect((await send('post', '/auth/invitations', { token: pm.accessToken, body: { userId: 'BS23001' } })).status).toBe(404);
        expect((await send('post', '/auth/invitations/activate', { body: { token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(404);
    });

    it('verification link request over HTTP: the same answer for any email; an unverified PM gets a fresh link', async () => {
        const { send, login, h } = ctx;
        const pm = await login('pm001@bs23.test');
        const created = await send('post', '/auth/accounts/pms', {
            token: pm.accessToken,
            body: { pmId: 'PM800020', name: 'Late', email: 'late@example.test', password: TEMP },
        });
        expect(created.status).toBe(201);

        const known = await send('post', '/auth/email/verify/request', { body: { email: 'late@example.test' } });
        const unknown = await send('post', '/auth/email/verify/request', { body: { email: 'nobody@example.test' } });
        expect(known.status).toBe(200);
        expect(unknown.status).toBe(200);
        expect(known.body.message).toBe(unknown.body.message);
        expect(known.body.verificationToken).not.toBe(created.body.verificationToken);

        expect((await send('post', '/auth/email/verify', { body: { token: created.body.verificationToken } })).status).toBe(400);
        expect((await send('post', '/auth/email/verify', { body: { token: known.body.verificationToken } })).status).toBe(200);
        expect(h.db.rows('pm').find((row) => row.pmId === 'PM800020')?.emailVerified).toBe(true);
        expect((await send('post', '/auth/email/verify/request', { body: { email: 'not-an-email' } })).status).toBe(400);
    });

    it('token purposes over HTTP: a verification token cannot reset a password, and a reset token cannot verify an email', async () => {
        const { send, login, h, workspace } = ctx;
        const pm = await login('pm001@bs23.test');
        const created = await send('post', '/auth/accounts/pms', {
            token: pm.accessToken,
            body: { pmId: 'PM800021', name: 'Purpose', email: 'purpose@example.test', password: TEMP },
        });
        // A dedicated user, so resetting its password cannot affect other tests.
        h.db.addUser(h.passwordHash, { userId: 'BS23099', workspaceId: workspace.id, email: 'purpose.user@bs23.test' });
        const forgot = await send('post', '/auth/password/forgot', { body: { workEmail: 'purpose.user@bs23.test' } });

        expect((await send('post', '/auth/password/reset', { body: { token: created.body.verificationToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(400);
        expect((await send('post', '/auth/email/verify', { body: { token: forgot.body.resetToken } })).status).toBe(400);
        // Both tokens are still usable for their own purpose afterwards.
        expect((await send('post', '/auth/email/verify', { body: { token: created.body.verificationToken } })).status).toBe(200);
        expect((await send('post', '/auth/password/reset', { body: { token: forgot.body.resetToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(200);
    });

    it('a mismatching confirmPassword is 400 over HTTP, and a missing one is 400 too', async () => {
        const { send, login } = ctx;
        const trainee = await login('BS23001');

        const mismatch = await send('post', '/auth/password/change', {
            token: trainee.accessToken,
            body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: 'Different-Passw0rd!' },
        });
        expect(mismatch.status).toBe(400);
        expect(mismatch.body.message).toBe('Passwords do not match.');
        const missing = await send('post', '/auth/password/change', {
            token: trainee.accessToken,
            body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        });
        expect(missing.status).toBe(400);
    });

    it('password reset over HTTP: the same answer for any email, single use, expired is 400', async () => {
        const { send, h } = ctx;

        const known = await send('post', '/auth/password/forgot', { body: { workEmail: 'bs23001@bs23.test' } });
        const unknown = await send('post', '/auth/password/forgot', { body: { workEmail: 'nobody@example.test' } });
        expect(known.status).toBe(200);
        expect(unknown.status).toBe(200);
        expect(known.body.message).toBe(unknown.body.message);

        const reset = await send('post', '/auth/password/reset', { body: { token: known.body.resetToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } });
        expect(reset.status).toBe(200);
        expect((await send('post', '/auth/password/reset', { body: { token: known.body.resetToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(400);

        const again = await send('post', '/auth/password/forgot', { body: { workEmail: 'pm001@bs23.test' } });
        h.db.rows('authToken').find((row) => row.pmId === 'PM001' && row.usedAt === null)!.expiresAt = new Date(Date.now() - 1000);
        expect((await send('post', '/auth/password/reset', { body: { token: again.body.resetToken, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(400);
    });

    it('PM self-registration and the old /identity routes do not exist (404)', async () => {
        const { send } = ctx;
        const body = { fullName: 'X', workEmail: 'x@example.test', password: 'Passw0rd!x1' };

        expect((await send('post', '/auth/register', { body })).status).toBe(404);
        expect((await send('post', '/auth/signup', { body })).status).toBe(404);
        expect((await send('post', '/identity/register', { body })).status).toBe(404);
        expect((await send('post', '/identity/login', { body: { identifier: 'a@b.co', password: PASSWORD } })).status).toBe(404);
    });
});

describe('rate limiting through the real RateLimitGuard', () => {
    it('login: the 11th attempt for one identifier is 429 with Retry-After; another IP and identifier are unaffected', async () => {
        const ctx = await makeApp();
        const ip = nextIp();
        const attempt = (identifier = 'pm001@bs23.test', from = ip) =>
            ctx.send('post', '/auth/login', { ip: from, body: { identifier, password: 'Wrong-Passw0rd' } });

        for (let i = 0; i < 10; i++) {
            expect((await attempt()).status).toBe(401);
        }
        const blocked = await attempt();
        expect(blocked.status).toBe(429);
        expect(blocked.headers['retry-after']).toBeDefined();
        expect(blocked.body).toMatchObject({ statusCode: 429, error: 'Too Many Requests', message: 'Too many attempts. Try again later.' });
        expect(JSON.stringify(blocked.body)).not.toContain('pm001');

        expect((await attempt('pm001@bs23.test', nextIp())).status).toBe(401);
        expect((await attempt('other@bs23.test')).status).toBe(401);
        // Even the right password is refused while limited: the guard runs first.
        const right = await ctx.send('post', '/auth/login', { ip, body: { identifier: 'pm001@bs23.test', password: PASSWORD } });
        expect(right.status).toBe(429);
        await ctx.app.close();
    });

    it('verification requests, password reset and forgot-password are throttled too', async () => {
        const ctx = await makeApp({
            AUTH_RATE_LIMIT_EMAIL_VERIFY_REQUEST_MAX: '2',
            AUTH_RATE_LIMIT_PASSWORD_RESET_MAX: '2',
            AUTH_RATE_LIMIT_PASSWORD_FORGOT_MAX: '2',
        });
        const ip = nextIp();

        for (const [path, body] of [
            ['/auth/email/verify/request', { email: 'nobody@example.test' }],
            ['/auth/password/reset', { token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }],
            ['/auth/password/forgot', { workEmail: 'nobody@example.test' }],
        ] as const) {
            const statuses: number[] = [];
            for (let i = 0; i < 3; i++) {
                statuses.push((await ctx.send('post', path, { ip, body })).status);
            }
            expect(statuses[2]).toBe(429);
        }
        await ctx.app.close();
    });
});
