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

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { ProfileService } from './profile.service.js';
import { ProfilePhotoStorage } from './profile-photo.storage.js';
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
    @Roles('TRAINEE')
    traineeOnly() {
        return { ok: true };
    }
}

let ipCounter = 0;
const nextIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

async function makeApp(env: Record<string, string> = {}) {
    const uploadDir = mkdtempSync(join(tmpdir(), 'bs23-photos-'));
    const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true', UPLOAD_DIR: uploadDir, ...env });
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
            ProfileService,
            ProfilePhotoStorage,
            JwtAuthGuard,
            RolesGuard,
            RateLimitGuard,
        ],
    }).compile();

    const app: INestApplication = moduleRef.createNestApplication();
    (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', true);
    await app.init();

    const send = (
        method: 'get' | 'post' | 'delete' | 'put' | 'patch',
        path: string,
        options: { ip?: string; token?: string; body?: object; file?: { bytes: Buffer; name: string; type: string } } = {},
    ) => {
        let req = request(app.getHttpServer())[method](path).set('X-Forwarded-For', options.ip ?? nextIp());
        if (options.token) req = req.set('Authorization', `Bearer ${options.token}`);
        if (options.file) {
            return req.attach('photo', options.file.bytes, { filename: options.file.name, contentType: options.file.type });
        }
        return options.body ? req.send(options.body) : req;
    };

    const login = async (identifier: string, password = PASSWORD) =>
        (await send('post', '/auth/login', { body: { identifier, password } })).body as {
            accessToken: string;
            refreshToken: string;
        };

    const close = async () => {
        await app.close();
        rmSync(uploadDir, { recursive: true, force: true });
    };

    return { app, h, send, login, team, close, ...seeded };
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
        await ctx.close();
    });

    it('PM logs in with email, Trainee with Trainee ID; trainee email, PM ID, wrong password and unknown account all get the same generic 401', async () => {
        const { send } = ctx;

        const pm = await send('post', '/auth/login', { body: { identifier: 'PM001@bs23.test', password: PASSWORD } });
        const trainee = await send('post', '/auth/login', { body: { identifier: 'bs23001', password: PASSWORD } });
        expect(pm.status).toBe(200);
        expect(pm.body.user).toMatchObject({ id: 'PM001', role: 'PM' });
        expect(trainee.status).toBe(200);
        expect(trainee.body.user).toMatchObject({ id: 'BS23001', role: 'TRAINEE' });
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
        expect(me.body.user).toMatchObject({ id: 'BS23001', role: 'TRAINEE' });

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
            body: { pmId: 'PM800002', name: 'Added PM', email: 'Added.PM@Example.test', password: TEMP, workspaceId: other.id, role: 'TRAINEE' },
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ pmId: 'PM800002', workspaceId: workspace.id, mustChangePassword: true, emailSent: false });
        expect(created.body).not.toHaveProperty('verificationToken');
        expect(JSON.stringify(created.body)).not.toMatch(new RegExp(`${TEMP}|passwordHash`));

        const dup = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800003', name: 'D', email: 'added.pm@example.test', password: TEMP } });
        expect(dup.status).toBe(409);
        const weak = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800004', name: 'W', email: 'w@example.test', password: 'short' } });
        expect(weak.status).toBe(400);
        // There is no invitation mode: a missing password is a 400, not an invitation.
        const none = await send('post', '/auth/accounts/pms', { token: pm.accessToken, body: { pmId: 'PM800006', name: 'N', email: 'n@example.test' } });
        expect(none.status).toBe(400);

        // No email verification: the new PM signs in at once, and is limited to the password change.
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
        // The credentials email goes out (best effort); the HTTP answer itself never carries the password.
        expect(h.mail.send).toHaveBeenCalledTimes(1);
        expect(h.mail.send.mock.calls[0][0].text).toContain(TEMP);

        // First login: signs in with the Trainee ID and the temporary password ...
        const signedIn = await send('post', '/auth/login', { body: { identifier: 'BS238010', password: TEMP } });
        expect(signedIn.status).toBe(200);
        expect(signedIn.body.user).toMatchObject({ role: 'TRAINEE', mustChangePassword: true });
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

    it('Edit User over HTTP: PM only, own users only (foreign and unknown give the same 404), body identity is ignored, bad input is 400/409, a password reset ends the user\'s sessions', async () => {
        const { send, login, h, team, workspace } = ctx;
        const pm = await login('pm001@bs23.test');
        const trainee = await login('BS23001');
        h.db.addPm(h.passwordHash, { pmId: 'PM003', workspaceId: workspace.id, email: 'pm003@bs23.test' });
        const otherPm = await login('pm003@bs23.test');
        const otherTeam = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM003', name: 'PM003 team' });

        const created = await send('post', '/auth/accounts/trainees', {
            token: pm.accessToken,
            body: {
                userId: 'BS238050', name: 'Edit Me', email: 'edit.me@example.test', temporaryPassword: TEMP,
                position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: isoDay(300),
                skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [team.id],
            },
        });
        expect(created.status).toBe(201);
        const path = '/auth/accounts/trainees/bs238050';

        // Guards: no token is 401, a Trainee is 403 (for reading and for saving).
        for (const method of ['get', 'patch'] as const) {
            expect((await send(method, path)).status).toBe(401);
            expect((await send(method, path, { token: trainee.accessToken })).status).toBe(403);
        }

        // GET fills the form from the database (the ID in the URL is not case sensitive).
        const read = await send('get', path, { token: pm.accessToken });
        expect(read.status).toBe(200);
        expect(read.body).toMatchObject({
            userId: 'BS238050', name: 'Edit Me', email: 'edit.me@example.test', position: 'QA',
            attendanceMode: 'ONLINE', teamIds: [team.id], archived: false,
        });
        expect(JSON.stringify(read.body)).not.toMatch(/passwordHash|tokenHash/);

        const form = (patch: object = {}) => ({
            name: 'Edit Me', email: 'edit.me@example.test', position: 'QA', attendanceMode: 'ONLINE', resource: 'TRAINEE',
            onboardDate: read.body.onboardDate, departureDate: read.body.departureDate, teamIds: [team.id],
            skillAssessmentMinutes: 30, skillAssessmentMarks: 50, ...patch,
        });

        // Another PM's user and an unknown ID give the same 404 (no information leak), for GET and PATCH.
        const foreign = await send('get', path, { token: otherPm.accessToken });
        const unknown = await send('get', '/auth/accounts/trainees/NOPE99', { token: pm.accessToken });
        expect(foreign.status).toBe(404);
        expect(unknown.status).toBe(404);
        expect(foreign.body.message).toBe(unknown.body.message);
        expect((await send('patch', path, { token: otherPm.accessToken, body: form({ name: 'Hijack' }) })).status).toBe(404);
        expect((await send('patch', '/auth/accounts/trainees/NOPE99', { token: pm.accessToken, body: form() })).status).toBe(404);
        expect(h.db.rows('user').find((row) => row.userId === 'BS238050')?.name).toBe('Edit Me');

        // Save: the fields change; a userId / pmId / workspaceId / role in the body is dropped by the DTO whitelist.
        const saved = await send('patch', path, {
            token: pm.accessToken,
            body: { ...form({ name: 'Edited Name', position: 'BACKEND' }), userId: 'BS999', pmId: 'PM003', workspaceId: 'x', role: 'PM' },
        });
        expect(saved.status).toBe(200);
        expect(saved.body).toMatchObject({ userId: 'BS238050', name: 'Edited Name', position: 'BACKEND', passwordReset: false });
        expect(h.db.rows('user').find((row) => row.userId === 'BS238050')).toMatchObject({
            name: 'Edited Name', position: 'BACKEND', pmId: 'PM001', workspaceId: workspace.id,
        });
        expect(h.db.rows('user').some((row) => row.userId === 'BS999')).toBe(false);

        // Bad input: 400 for a wrong value, 409 for an email that belongs to another account.
        const bad = async (patch: object, status: number) =>
            expect((await send('patch', path, { token: pm.accessToken, body: form(patch) })).status).toBe(status);
        await bad({ position: 'DESIGNER' }, 400);
        await bad({ attendanceMode: 'HYBRID' }, 400);
        await bad({ resource: 'ADMIN' }, 400);
        await bad({ teamIds: [] }, 400);
        await bad({ teamIds: [otherTeam.id] }, 400);
        await bad({ email: 'not-an-email' }, 400);
        await bad({ name: '   ' }, 400);
        await bad({ name: undefined }, 400);
        await bad({ skillAssessmentMinutes: 500 }, 400);
        await bad({ temporaryPassword: 'short' }, 400);
        await bad({ email: 'bs23001@bs23.test' }, 409);

        // A password reset: the user's sessions end, the old password stops working, the new one is never echoed.
        const session = await send('post', '/auth/login', { body: { identifier: 'BS238050', password: TEMP } });
        expect(session.status).toBe(200);
        const reset = await send('patch', path, { token: pm.accessToken, body: form({ temporaryPassword: NEW_PASSWORD }) });
        expect(reset.status).toBe(200);
        expect(reset.body).toMatchObject({ passwordReset: true });
        expect(JSON.stringify(reset.body)).not.toContain(NEW_PASSWORD);
        expect((await send('get', '/auth/me', { token: session.body.accessToken })).status).toBe(401);
        expect((await send('post', '/auth/login', { body: { identifier: 'BS238050', password: TEMP } })).status).toBe(401);
        expect((await send('post', '/auth/login', { body: { identifier: 'BS238050', password: NEW_PASSWORD } })).status).toBe(200);
    });

    it('invitation routes do not exist (404): the approved schema cannot separate them from password reset', async () => {
        const { send, login } = ctx;
        const pm = await login('pm001@bs23.test');

        expect((await send('post', '/auth/invitations', { token: pm.accessToken, body: { userId: 'BS23001' } })).status).toBe(404);
        expect((await send('post', '/auth/invitations/activate', { body: { token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD } })).status).toBe(404);
    });

    it('profile over HTTP: PATCH /auth/me/profile changes only the caller, trims, validates, and /me shows it', async () => {
        const { send, login, h } = ctx;
        const trainee = await login('BS23001');
        const pm = await login('pm001@bs23.test');

        const updated = await send('patch', '/auth/me/profile', {
            token: trainee.accessToken,
            // userId / pmId in the body are not accepted: the account is always the one in the token.
            body: { name: '  New Name  ', bio: '  I like APIs  ', userId: 'BS23999', pmId: 'PM999' },
        });
        expect(updated.status).toBe(200);
        expect(updated.body.user).toEqual({ id: 'BS23001', name: 'New Name', bio: 'I like APIs' });
        expect(h.db.rows('user').find((row) => row.userId === 'BS23001')).toMatchObject({ name: 'New Name', bio: 'I like APIs' });
        expect(h.db.rows('pm').find((row) => row.pmId === 'PM001')?.name).not.toBe('New Name');

        const me = await send('get', '/auth/me', { token: trainee.accessToken });
        expect(me.body.user).toMatchObject({ name: 'New Name', bio: 'I like APIs', hasPhoto: false });

        expect((await send('patch', '/auth/me/profile', { token: pm.accessToken, body: { name: '   ' } })).status).toBe(400);
        expect((await send('patch', '/auth/me/profile', { token: pm.accessToken, body: { name: 'x'.repeat(121) } })).status).toBe(400);
        expect((await send('patch', '/auth/me/profile', { token: pm.accessToken, body: { name: 'Ok', bio: 'x'.repeat(1001) } })).status).toBe(400);
        expect((await send('patch', '/auth/me/profile', { body: { name: 'Anon' } })).status).toBe(401);
    });

    it('photo over HTTP: upload, read back, replace with another type, remove; bad uploads are 400; auth is required', async () => {
        const { send, login } = ctx;
        const pm = await login('pm001@bs23.test');
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
        const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7, 8]);

        expect((await send('get', '/auth/me/photo', { token: pm.accessToken })).status).toBe(404);
        expect((await send('put', '/auth/me/photo', { file: { bytes: png, name: 'a.png', type: 'image/png' } })).status).toBe(401);

        const up = await send('put', '/auth/me/photo', { token: pm.accessToken, file: { bytes: png, name: 'a.png', type: 'image/png' } });
        expect(up.status).toBe(200);
        expect(up.body).toMatchObject({ hasPhoto: true });
        expect((await send('get', '/auth/me', { token: pm.accessToken })).body.user.hasPhoto).toBe(true);

        const got = await send('get', '/auth/me/photo', { token: pm.accessToken });
        expect(got.status).toBe(200);
        expect(got.headers['content-type']).toContain('image/png');
        expect(got.headers['x-content-type-options']).toBe('nosniff');
        expect(Buffer.from(got.body as Buffer).equals(png)).toBe(true);

        // A new type replaces the old one (the old file does not stay behind).
        await send('put', '/auth/me/photo', { token: pm.accessToken, file: { bytes: jpg, name: 'b.jpg', type: 'image/jpeg' } });
        const again = await send('get', '/auth/me/photo', { token: pm.accessToken });
        expect(again.headers['content-type']).toContain('image/jpeg');

        // The claimed type does not matter: a script named .png is refused.
        const fake = await send('put', '/auth/me/photo', {
            token: pm.accessToken,
            file: { bytes: Buffer.from('<script>alert(1)</script>'), name: 'x.png', type: 'image/png' },
        });
        expect(fake.status).toBe(400);
        expect(fake.body.message).toBe('Choose a JPG, PNG or WebP image under 2 MB.');
        // Over 2 MB is refused too.
        const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)]);
        expect((await send('put', '/auth/me/photo', { token: pm.accessToken, file: { bytes: big, name: 'big.png', type: 'image/png' } })).status).toBe(413);
        // No file at all.
        expect((await send('put', '/auth/me/photo', { token: pm.accessToken })).status).toBe(400);

        // One account never sees another's photo.
        const other = await login('BS23001');
        expect((await send('get', '/auth/me/photo', { token: other.accessToken })).status).toBe(404);

        const removed = await send('delete', '/auth/me/photo', { token: pm.accessToken });
        expect(removed.body).toMatchObject({ hasPhoto: false });
        expect((await send('get', '/auth/me/photo', { token: pm.accessToken })).status).toBe(404);
        expect((await send('get', '/auth/me', { token: pm.accessToken })).body.user.hasPhoto).toBe(false);
    });

    it('the email-verification routes no longer exist (404), and the resend-email route needs a PM', async () => {
        const { send, login, h, workspace } = ctx;
        // A user still on the temporary password (it has not signed in yet).
        h.db.addUser(h.passwordHash, { userId: 'BS23098', workspaceId: workspace.id, email: 'pending@bs23.test', mustChangePassword: true });
        const pm = await login('pm001@bs23.test');

        for (const path of ['/auth/email/verify', '/auth/email/verify/request', '/auth/email/verify/resend']) {
            expect((await send('post', path, { token: pm.accessToken, body: { token: 'x', email: 'a@b.cc' } })).status).toBe(404);
        }

        const trainee = await login('BS23001');
        expect((await send('post', '/auth/accounts/BS23001/resend-email', { token: trainee.accessToken })).status).toBe(403);
        expect((await send('post', '/auth/accounts/BS23001/resend-email')).status).toBe(401);
        expect((await send('post', '/auth/accounts/NOPE99/resend-email', { token: pm.accessToken })).status).toBe(404);
        // An account that already chose its own password cannot be reissued (Forgot password is the way).
        expect((await send('post', '/auth/accounts/BS23001/resend-email', { token: pm.accessToken })).status).toBe(400);
        const sent = await send('post', '/auth/accounts/bs23098/resend-email', { token: pm.accessToken });
        expect(sent.status).toBe(200);
        expect(sent.body).toMatchObject({ emailSent: false });
        expect(sent.body.temporaryPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{14}$/);
        const signedIn = await send('post', '/auth/login', { body: { identifier: 'BS23098', password: sent.body.temporaryPassword } });
        expect(signedIn.status).toBe(200);
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
        await ctx.close();
    });

    it('password reset and forgot-password are throttled too', async () => {
        const ctx = await makeApp({
            AUTH_RATE_LIMIT_PASSWORD_RESET_MAX: '2',
            AUTH_RATE_LIMIT_PASSWORD_FORGOT_MAX: '2',
        });
        const ip = nextIp();

        for (const [path, body] of [
            ['/auth/password/reset', { token: 'f'.repeat(64), newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }],
            ['/auth/password/forgot', { workEmail: 'nobody@example.test' }],
        ] as const) {
            const statuses: number[] = [];
            for (let i = 0; i < 3; i++) {
                statuses.push((await ctx.send('post', path, { ip, body })).status);
            }
            expect(statuses[2]).toBe(429);
        }
        await ctx.close();
    });
});
