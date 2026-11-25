import { readFileSync } from 'node:fs';

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from '@nestjs/common';

import {
    NEW_PASSWORD,
    makeHarness,
    seedAccounts,
} from '../../../test/support/identity-harness.js';
import { provisionInitialPm } from './provisioning.js';

const TEMP = 'Temp0rary!pw1';

const actorOf = (pm: Record<string, any>) => ({
    sub: pm.pmId as string,
    role: 'PM' as const,
    workspaceId: pm.workspaceId as string,
});

const newPm = (overrides: Record<string, unknown> = {}) => ({
    pmId: 'PM002',
    name: 'Second PM',
    email: 'Second.PM@Example.com',
    password: TEMP,
    ...overrides,
});

// A departure date that is always in the future, whatever day the tests run.
const isoDay = (daysFromNow: number) =>
    new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);

async function setup(env: Record<string, string> = {}) {
    const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true', ...env });
    const seeded = await seedAccounts(h);

    return { h, ...seeded, actor: actorOf(seeded.pm) };
}

describe('AccountProvisioningService.createPm (Add PM, PRD FR-DIR-09)', () => {
    it('lets an authorized PM create a PM in the SAME workspace, able to sign in, with the typed password', async () => {
        const { h, actor, workspace } = await setup();

        const result = await h.provisioning.createPm(actor, newPm());

        expect(result).toMatchObject({
            pmId: 'PM002',
            workspaceId: workspace.id,
            name: 'Second PM',
            email: 'second.pm@example.com',
            mustChangePassword: true,
        });
        expect(h.db.rows('pm')[1]).toMatchObject({
            pmId: 'PM002',
            workspaceId: workspace.id,
            emailVerified: true,
            mustChangePassword: true,
        });
        expect(h.db.rows('credential')[2]).toMatchObject({ pmId: 'PM002', userId: null });
        // No token of any kind is created (no email verification, no invitation).
        expect(h.db.rows('authToken')).toHaveLength(0);
        expect(h.db.rows('authToken').filter((row) => row.type === 'PASSWORD_RESET')).toHaveLength(0);
    });

    it('stores a scrypt hash, never the password, and creates no token', async () => {
        const { h, actor } = await setup();

        await h.provisioning.createPm(actor, newPm());

        const credential = h.db.rows('credential')[2];
        expect(credential.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(JSON.stringify(h.db.rows('credential'))).not.toContain(TEMP);
        expect(h.db.rows('authToken')).toHaveLength(0);
    });

    it('the new PM can sign in at once and must change the password', async () => {
        const { h, actor } = await setup();
        await h.provisioning.createPm(actor, newPm());

        const login = await h.service.login({ identifier: 'SECOND.pm@example.com', password: TEMP });

        expect(login.user).toMatchObject({ id: 'PM002', role: 'PM', mustChangePassword: true });
    });

    it('emails the credentials (ID, temporary password, sign-in link) and no link token', async () => {
        const { h, actor } = await setup();
        const result = await h.provisioning.createPm(actor, newPm());

        expect(h.mail.send).toHaveBeenCalledTimes(1);
        const text = h.mail.send.mock.calls[0][0].text as string;
        expect(text).toContain('PM002');
        expect(text).toContain(TEMP);
        expect(text).toContain('http://localhost:3000/login');
        expect(text).not.toMatch(/token=/);
        expect(result.emailSent).toBe(false);
        expect(result).not.toHaveProperty('verificationToken');
        expect(result).not.toHaveProperty('verificationLink');
    });

    it('records a notification for the new PM and an outbox event, in the same transaction (FR-14, FR-15)', async () => {
        const { h, actor, workspace } = await setup();

        await h.provisioning.createPm(actor, newPm());

        expect(h.db.rows('notification')).toHaveLength(1);
        expect(h.db.rows('notification')[0]).toMatchObject({
            workspaceId: workspace.id,
            pmId: 'PM002',
            userId: null,
            readAt: null,
        });
        expect(h.db.rows('outboxEvent')).toHaveLength(1);
        expect(h.db.rows('outboxEvent')[0]).toMatchObject({
            workspaceId: workspace.id,
            type: 'auth.account_created',
            status: 'PENDING',
            payload: { accountRole: 'PM', accountId: 'PM002', actorPmId: 'PM001' },
        });
        const stored = JSON.stringify([h.db.rows('notification'), h.db.rows('outboxEvent')]);
        expect(stored).not.toContain(TEMP);
        expect(stored).not.toContain('second.pm@example.com');
    });

    it('refuses a Trainee, an unknown PM and a PM of another workspace (nothing is created)', async () => {
        const { h, user, pm, actor } = await setup();
        const other = h.db.addWorkspace({ slug: 'other' });

        await expect(
            h.provisioning.createPm({ sub: user.userId, role: 'TRAINEE', workspaceId: user.workspaceId }, newPm()),
        ).rejects.toThrow(ForbiddenException);
        await expect(
            h.provisioning.createPm({ ...actor, sub: 'PM999' }, newPm()),
        ).rejects.toThrow(ForbiddenException);
        // The caller claims another workspace than the PM really belongs to.
        await expect(
            h.provisioning.createPm({ ...actor, workspaceId: other.id }, newPm()),
        ).rejects.toThrow(ForbiddenException);
        // A trainee id presented as a PM role is still not a PM row.
        await expect(
            h.provisioning.createPm({ sub: 'BS23001', role: 'PM', workspaceId: pm.workspaceId }, newPm()),
        ).rejects.toThrow(ForbiddenException);

        expect(h.db.rows('pm')).toHaveLength(1);
        expect(h.db.rows('authToken')).toHaveLength(0);
        expect(h.db.rows('notification')).toHaveLength(0);
        expect(h.db.rows('outboxEvent')).toHaveLength(0);
    });

    it('validates the input: all four fields are required', async () => {
        const { h, actor } = await setup();
        const bad = (overrides: Record<string, unknown>) =>
            expect(h.provisioning.createPm(actor, newPm(overrides) as never)).rejects.toThrow(BadRequestException);

        await bad({ pmId: 'BS23001' });
        await bad({ pmId: 'pm002' });
        await bad({ pmId: 'PM2' });
        await bad({ pmId: undefined });
        await bad({ name: '   ' });
        await bad({ name: undefined });
        await bad({ email: 'not-an-email' });
        await bad({ email: undefined });
        await bad({ password: 'short' });
        await bad({ password: 'x'.repeat(129) });
        await bad({ password: undefined }); // no invitation mode: the password is required
        expect(h.db.rows('pm')).toHaveLength(1);
    });

    it('rejects an email already used by any PM or user, in any case and in any workspace', async () => {
        const { h, actor } = await setup();
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'taken.pm@example.com' });
        h.db.addUser('hash', { userId: 'BS23050', workspaceId: other.id, email: 'taken.user@example.com', pmId: 'PM050' });

        for (const email of ['PM001@bs23.test', 'Taken.PM@Example.com', 'taken.user@EXAMPLE.com']) {
            await expect(h.provisioning.createPm(actor, newPm({ email }))).rejects.toThrow(ConflictException);
        }
        expect(h.db.rows('pm')).toHaveLength(2);
    });

    it('rejects a PM ID that already exists', async () => {
        const { h, actor } = await setup();

        await expect(
            h.provisioning.createPm(actor, newPm({ pmId: 'PM001' })),
        ).rejects.toThrow('PM ID already exists.');
    });

    it('maps the database email trigger and a unique-key race to a conflict, not a 500', async () => {
        const { h, actor } = await setup();
        const create = h.db.pm.create.bind(h.db.pm);

        h.db.pm.create = async () => {
            throw new Error('email second.pm@example.com is already used by a User');
        };
        await expect(h.provisioning.createPm(actor, newPm())).rejects.toThrow('Email is already in use.');

        h.db.pm.create = async () => {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        };
        await expect(h.provisioning.createPm(actor, newPm())).rejects.toThrow('PM ID already exists.');

        h.db.pm.create = async () => {
            throw new Error('connection lost');
        };
        await expect(h.provisioning.createPm(actor, newPm())).rejects.toThrow('connection lost');

        h.db.pm.create = create;
    });

    it('rolls everything back when a later step fails, including the outbox write (no half-created PM)', async () => {
        const { h, actor } = await setup();

        for (const table of ['notification', 'outboxEvent'] as const) {
            const original = h.db[table].create.bind(h.db[table]);

            h.db[table].create = async () => {
                throw new Error('boom');
            };
            await expect(h.provisioning.createPm(actor, newPm())).rejects.toThrow('boom');

            expect(h.db.rows('pm')).toHaveLength(1);
            expect(h.db.rows('credential')).toHaveLength(2);
            expect(h.db.rows('authToken')).toHaveLength(0);
            expect(h.db.rows('notification')).toHaveLength(0);
            expect(h.db.rows('outboxEvent')).toHaveLength(0);
            h.db[table].create = original;
        }
    });

    it('a PM created this way only gets the creating PM\'s workspace, never one chosen by the input', async () => {
        const { h, actor, workspace } = await setup();
        const other = h.db.addWorkspace({ slug: 'other' });

        await h.provisioning.createPm(actor, newPm({ workspaceId: other.id }));

        expect(h.db.rows('pm')[1].workspaceId).toBe(workspace.id);
    });
});

describe('AccountProvisioningService.createTrainee (Add Trainee, PRD FR-DIR-04, temporary password)', () => {
    const traineeInput = (overrides: Record<string, unknown> = {}) => ({
        userId: 'bs23002',
        name: 'New Trainee',
        email: 'New.Trainee@Example.com',
        temporaryPassword: TEMP,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        resource: 'TRAINEE',
        onboardDate: '2026-02-01',
        departureDate: isoDay(365),
        skillAssessmentMinutes: 60,
        skillAssessmentMarks: 100,
        teamIds: [] as string[],
        ...overrides,
    });

    async function withTeam(env: Record<string, string> = {}) {
        const ctx = await setup(env);
        const team = ctx.h.db.addTeam({ workspaceId: ctx.workspace.id, pmId: ctx.pm.pmId });

        return { ...ctx, team, input: (o: Record<string, unknown> = {}) => traineeInput({ teamIds: [team.id], ...o }) };
    }

    it('creates the user (managed by the actor), memberships and credential; the account is active at once', async () => {
        const { h, actor, workspace, team, input } = await withTeam();
        const departureDate = isoDay(365);

        const result = await h.provisioning.createTrainee(actor, input({ departureDate }));

        expect(result).toMatchObject({
            userId: 'BS23002',
            workspaceId: workspace.id,
            pmId: 'PM001',
            email: 'new.trainee@example.com',
            resource: 'TRAINEE',
            departureDate,
            skillAssessmentMinutes: 60,
            skillAssessmentMarks: 100,
            teamIds: [team.id],
            active: true,
            mustChangePassword: true,
        });
        expect(h.db.rows('user')[1]).toMatchObject({
            userId: 'BS23002',
            pmId: 'PM001',
            workspaceId: workspace.id,
            position: 'BACKEND',
            attendanceMode: 'ONLINE',
            skillAssessmentMinutes: 60,
            skillAssessmentMarks: 100,
            mustChangePassword: true,
            archivedAt: null,
        });
        expect(h.db.rows('user')[1].departureDate.toISOString().slice(0, 10)).toBe(departureDate);
        expect(h.db.rows('membership')).toMatchObject([{ teamId: team.id, userId: 'BS23002', workspaceId: workspace.id }]);
        expect(h.db.rows('credential')[2]).toMatchObject({ userId: 'BS23002', pmId: null });
        expect(h.db.rows('credential')[2].passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(JSON.stringify(result)).not.toContain(TEMP);
    });

    it('does not depend on email: the credentials are mailed best effort, no token is created, and the trainee signs in with the Trainee ID', async () => {
        const { h, actor, input } = await withTeam();

        const created = await h.provisioning.createTrainee(actor, input());

        expect(created.emailSent).toBe(false);
        expect(h.mail.send).toHaveBeenCalledTimes(1);
        expect(h.mail.send.mock.calls[0][0].text).toContain(TEMP);
        expect(h.mail.send.mock.calls[0][0].text).toContain('BS23002');
        expect(h.db.rows('authToken')).toHaveLength(0);

        const login = await h.service.login({ identifier: 'bs23002', password: TEMP });
        expect(login.user).toMatchObject({ id: 'BS23002', role: 'TRAINEE', mustChangePassword: true });
        await expect(
            h.service.login({ identifier: 'new.trainee@example.com', password: TEMP }),
        ).rejects.toThrow('Invalid credentials.');
    });

    it('first login requires a password change; afterwards the flag is cleared and the temporary password stops working', async () => {
        const { h, actor, input } = await withTeam();
        await h.provisioning.createTrainee(actor, input());

        const first = await h.service.login({ identifier: 'BS23002', password: TEMP });
        await h.service.login({ identifier: 'BS23002', password: TEMP });
        const [current] = h.db.rows('session');

        await h.service.changePassword('TRAINEE', 'BS23002', first.user.workspaceId, current.id as string, {
            currentPassword: TEMP,
            newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD,
        });

        expect(h.db.rows('user')[1].mustChangePassword).toBe(false);
        // The device that changed the password stays signed in, the other one is signed out.
        expect(h.db.rows('session')[0].endedAt).toBeNull();
        expect(h.db.rows('session')[1].endedAt).toBeInstanceOf(Date);
        await expect(h.service.login({ identifier: 'BS23002', password: TEMP })).rejects.toThrow('Invalid credentials.');
        const again = await h.service.login({ identifier: 'BS23002', password: NEW_PASSWORD });
        expect(again.user.mustChangePassword).toBe(false);
    });

    it('records a notification for the trainee and an outbox event (identifiers only)', async () => {
        const { h, actor, workspace, input } = await withTeam();

        await h.provisioning.createTrainee(actor, input());

        expect(h.db.rows('notification')).toMatchObject([
            { workspaceId: workspace.id, userId: 'BS23002', pmId: null, link: '/change-password' },
        ]);
        expect(h.db.rows('outboxEvent')).toMatchObject([
            {
                workspaceId: workspace.id,
                type: 'auth.account_created',
                payload: { accountRole: 'TRAINEE', accountId: 'BS23002', actorPmId: 'PM001' },
            },
        ]);
        const stored = JSON.stringify([h.db.rows('notification'), h.db.rows('outboxEvent')]);
        expect(stored).not.toContain(TEMP);
        expect(stored).not.toContain('new.trainee@example.com');
    });

    it('only an authorized PM may create: Trainee, unknown PM and wrong-workspace claim are refused (nothing is created)', async () => {
        const { h, actor, user, input } = await withTeam();
        const other = h.db.addWorkspace({ slug: 'other' });

        await expect(
            h.provisioning.createTrainee({ sub: user.userId, role: 'TRAINEE', workspaceId: user.workspaceId }, input()),
        ).rejects.toThrow(ForbiddenException);
        await expect(h.provisioning.createTrainee({ ...actor, sub: 'PM999' }, input())).rejects.toThrow(ForbiddenException);
        await expect(h.provisioning.createTrainee({ ...actor, workspaceId: other.id }, input())).rejects.toThrow(ForbiddenException);

        expect(h.db.rows('user')).toHaveLength(1);
        expect(h.db.rows('membership')).toHaveLength(0);
        expect(h.db.rows('outboxEvent')).toHaveLength(0);
    });

    it('never takes the workspace, PM or role from the input', async () => {
        const { h, actor, workspace, input } = await withTeam();
        const other = h.db.addWorkspace({ slug: 'other' });

        await h.provisioning.createTrainee(actor, input({ workspaceId: other.id, pmId: 'PM777', role: 'PM' }));

        expect(h.db.rows('user')[1]).toMatchObject({ workspaceId: workspace.id, pmId: 'PM001' });
    });

    describe('PM scope (pmId) and workspace isolation', () => {
        it('a team of ANOTHER PM in the same workspace is refused, and the same error as an unknown team', async () => {
            const { h, actor, workspace, input } = await withTeam();
            h.db.addPm('hash', { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
            const theirs = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM002', name: 'PM002 team' });

            const foreign = await h.provisioning.createTrainee(actor, input({ teamIds: [theirs.id] })).catch((e) => e);
            const unknown = await h.provisioning.createTrainee(actor, input({ teamIds: ['no-such-team'] })).catch((e) => e);

            expect(foreign).toBeInstanceOf(BadRequestException);
            expect(foreign.message).toBe(unknown.message);
            expect(h.db.rows('user')).toHaveLength(1);
            expect(h.db.rows('membership')).toHaveLength(0);
        });

        it('mixing one own team with one foreign team refuses the whole request', async () => {
            const { h, actor, workspace, team, input } = await withTeam();
            h.db.addPm('hash', { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
            const theirs = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM002', name: 'PM002 team' });

            await expect(
                h.provisioning.createTrainee(actor, input({ teamIds: [team.id, theirs.id] })),
            ).rejects.toThrow('One or more teams were not found.');
            expect(h.db.rows('user')).toHaveLength(1);
        });

        it('each PM manages only the trainees they create, with their own teams', async () => {
            const { h, actor, workspace, input } = await withTeam();
            const second = h.db.addPm(h.passwordHash, { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
            const theirs = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM002', name: 'PM002 team' });

            await h.provisioning.createTrainee(actor, input());
            await h.provisioning.createTrainee(actorOf(second), input({
                userId: 'BS23003', email: 'three@example.com', teamIds: [theirs.id],
            }));

            const managed = (pmId: string) => h.db.rows('user').filter((row) => row.pmId === pmId).map((row) => row.userId);
            expect(managed('PM001')).toEqual(['BS23001', 'BS23002']);
            expect(managed('PM002')).toEqual(['BS23003']);
        });

        it('a team of another workspace and an archived team are refused', async () => {
            const { h, actor, workspace, input } = await withTeam();
            const other = h.db.addWorkspace({ slug: 'other' });
            const otherPm = h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'p50@bs23.test' });
            const foreign = h.db.addTeam({ workspaceId: other.id, pmId: otherPm.pmId, name: 'Foreign' });
            // Same PM id on the team but another workspace: still refused.
            const crossed = h.db.addTeam({ workspaceId: other.id, pmId: 'PM001', name: 'Crossed' });
            const archived = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM001', name: 'Old', archivedAt: new Date() });

            for (const teamIds of [[foreign.id], [crossed.id], [archived.id], ['nope'], [] as string[]]) {
                await expect(h.provisioning.createTrainee(actor, input({ teamIds }))).rejects.toThrow(BadRequestException);
            }
            expect(h.db.rows('user')).toHaveLength(1);
        });
    });

    it('requires every PRD field (no field is optional except resource)', async () => {
        const { h, actor, input } = await withTeam();

        for (const field of [
            'userId', 'name', 'email', 'temporaryPassword', 'position', 'attendanceMode',
            'onboardDate', 'departureDate', 'skillAssessmentMinutes', 'skillAssessmentMarks', 'teamIds',
        ]) {
            await expect(
                h.provisioning.createTrainee(actor, input({ [field]: undefined }) as never),
            ).rejects.toThrow(BadRequestException);
        }
        expect(h.db.rows('user')).toHaveLength(1);

        // `resource` defaults to TRAINEE.
        const created = await h.provisioning.createTrainee(actor, input({ resource: undefined }));
        expect(created.resource).toBe('TRAINEE');
    });

    it('validates every field', async () => {
        const { h, actor, input } = await withTeam();
        const bad = (overrides: Record<string, unknown>) =>
            expect(h.provisioning.createTrainee(actor, input(overrides))).rejects.toThrow(BadRequestException);

        await bad({ userId: 'PM002' }); // looks like a PM ID
        await bad({ userId: 'a@b.com' });
        await bad({ userId: 'x' });
        await bad({ name: ' ' });
        await bad({ email: 'nope' });
        await bad({ temporaryPassword: 'short' });
        await bad({ position: 'DESIGNER' });
        await bad({ attendanceMode: 'HYBRID' });
        await bad({ resource: 'ADMIN' });
        await bad({ onboardDate: '2026-13-40' });
        await bad({ onboardDate: '01/02/2026' });
        await bad({ departureDate: '2026-01-01' }); // not after onboarding
        await bad({ departureDate: 'soon' });
        await bad({ onboardDate: '2020-01-01', departureDate: '2021-01-01' }); // already past
        await bad({ skillAssessmentMinutes: 0 });
        await bad({ skillAssessmentMinutes: 181 });
        await bad({ skillAssessmentMinutes: 60.5 });
        await bad({ skillAssessmentMarks: 0 });
        await bad({ skillAssessmentMarks: 1001 });
        expect(h.db.rows('user')).toHaveLength(1);
    });

    it('rejects a duplicate Trainee ID (409) and an email used by any PM or user in any workspace (409)', async () => {
        const { h, actor, input } = await withTeam();
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'taken.pm@example.com' });

        await expect(h.provisioning.createTrainee(actor, input({ userId: 'BS23001' }))).rejects.toThrow('Trainee ID already exists.');
        for (const email of ['bs23001@bs23.test', 'TAKEN.pm@example.com', 'pm001@bs23.test']) {
            await expect(h.provisioning.createTrainee(actor, input({ email }))).rejects.toThrow(ConflictException);
        }
        expect(h.db.rows('user')).toHaveLength(1);
    });

    it('maps the email trigger and a unique race to 409, and rolls the whole thing back on a later failure', async () => {
        const { h, actor, input } = await withTeam();
        const userCreate = h.db.user.create.bind(h.db.user);

        h.db.user.create = async () => {
            throw new Error('email new.trainee@example.com is already used by a PM');
        };
        await expect(h.provisioning.createTrainee(actor, input())).rejects.toThrow('Email is already in use.');

        h.db.user.create = async () => {
            throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        };
        await expect(h.provisioning.createTrainee(actor, input())).rejects.toThrow('Trainee ID already exists.');
        h.db.user.create = userCreate;

        for (const table of ['membership', 'credential', 'notification', 'outboxEvent'] as const) {
            const original = h.db[table].create.bind(h.db[table]);

            h.db[table].create = async () => {
                throw new Error('boom');
            };
            await expect(h.provisioning.createTrainee(actor, input())).rejects.toThrow('boom');

            expect(h.db.rows('user')).toHaveLength(1);
            expect(h.db.rows('membership')).toHaveLength(0);
            expect(h.db.rows('credential')).toHaveLength(2); // only the two seeded accounts
            expect(h.db.rows('notification')).toHaveLength(0);
            expect(h.db.rows('outboxEvent')).toHaveLength(0);
            h.db[table].create = original;
        }
    });
});

describe('AccountProvisioningService.getTrainee / updateTrainee (Edit User, PRD FR-DIR-05)', () => {
    const formOf = (teamIds: string[], overrides: Record<string, unknown> = {}) => ({
        name: 'Edited Name',
        email: 'edited@example.com',
        position: 'FRONTEND',
        attendanceMode: 'PHYSICAL',
        resource: 'SBU',
        onboardDate: '2026-02-01',
        departureDate: isoDay(400),
        skillAssessmentMinutes: 30,
        skillAssessmentMarks: 50,
        teamIds,
        ...overrides,
    });

    // A user BS23002 created the normal way, in team Alpha, managed by PM001.
    async function withUser() {
        const ctx = await setup();
        const { h, actor, workspace, pm } = ctx;
        const alpha = h.db.addTeam({ workspaceId: workspace.id, pmId: pm.pmId });
        const beta = h.db.addTeam({ workspaceId: workspace.id, pmId: pm.pmId, name: 'Team Beta' });

        await h.provisioning.createTrainee(actor, {
            userId: 'BS23002',
            name: 'New Trainee',
            email: 'new.trainee@example.com',
            temporaryPassword: TEMP,
            position: 'BACKEND',
            attendanceMode: 'ONLINE',
            onboardDate: '2026-02-01',
            departureDate: isoDay(365),
            skillAssessmentMinutes: 60,
            skillAssessmentMarks: 100,
            teamIds: [alpha.id],
        });

        return { ...ctx, alpha, beta };
    }

    it('getTrainee returns the saved values and the PM\'s own teams the user is in', async () => {
        const { h, actor, alpha } = await withUser();

        expect(await h.provisioning.getTrainee(actor, 'bs23002')).toMatchObject({
            userId: 'BS23002',
            name: 'New Trainee',
            email: 'new.trainee@example.com',
            resource: 'TRAINEE',
            position: 'BACKEND',
            onboardDate: '2026-02-01',
            departureDate: isoDay(365),
            skillAssessmentMinutes: 60,
            teamIds: [alpha.id],
            archived: false,
        });
    });

    it('saves the fields, keeps the User ID and the password, and sets the PM\'s memberships to exactly teamIds', async () => {
        const { h, actor, alpha, beta } = await withUser();
        const hashBefore = h.db.rows('credential')[2].passwordHash;

        const result = await h.provisioning.updateTrainee(actor, 'BS23002', formOf([beta.id]));

        expect(result).toMatchObject({
            userId: 'BS23002',
            name: 'Edited Name',
            email: 'edited@example.com',
            resource: 'SBU',
            teamIds: [beta.id],
            reactivated: false,
            passwordReset: false,
            emailSent: false,
        });
        expect(h.db.rows('user')[1]).toMatchObject({ userId: 'BS23002', pmId: 'PM001', position: 'FRONTEND', mustChangePassword: true });
        expect(h.db.rows('credential')[2].passwordHash).toBe(hashBefore);
        // Alpha is left (the row stays as history), Beta is joined.
        const alphaRow = h.db.rows('membership').find((m) => m.teamId === alpha.id);
        const betaRow = h.db.rows('membership').find((m) => m.teamId === beta.id);
        expect(alphaRow?.leftAt).toBeInstanceOf(Date);
        expect(betaRow?.leftAt).toBeNull();
        expect((await h.provisioning.getTrainee(actor, 'BS23002')).teamIds).toEqual([beta.id]);
        expect(h.mail.send).toHaveBeenCalledTimes(1); // only the one from Add User, nothing for an ordinary edit
    });

    it('rejoining a team clears leftAt instead of creating a second membership', async () => {
        const { h, actor, alpha, beta } = await withUser();

        await h.provisioning.updateTrainee(actor, 'BS23002', formOf([beta.id]));
        await h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id, beta.id]));

        expect(h.db.rows('membership')).toHaveLength(2);
        expect(h.db.rows('membership').every((m) => m.leftAt === null)).toBe(true);
    });

    it('lets the user keep their own email (any case) but refuses an email of another account in any workspace', async () => {
        const { h, actor, alpha } = await withUser();
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'taken.pm@example.com' });

        await h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { email: 'NEW.Trainee@Example.com' }));
        expect(h.db.rows('user')[1].email).toBe('new.trainee@example.com');

        for (const email of ['taken.pm@example.com', 'PM001@bs23.test', 'bs23001@bs23.test']) {
            await expect(
                h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { email })),
            ).rejects.toThrow(ConflictException);
        }
        expect(h.db.rows('user')[1].email).toBe('new.trainee@example.com');
    });

    it('maps the database email trigger to 409 on an update, not a 500', async () => {
        const { h, actor, alpha } = await withUser();
        const update = h.db.user.update.bind(h.db.user);

        h.db.user.update = async () => {
            throw new Error('email edited@example.com is already used by a PM');
        };
        await expect(
            h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id])),
        ).rejects.toThrow('Email is already in use.');

        h.db.user.update = update;
    });

    it('a changed email stops the unused reset links that went to the old address', async () => {
        const { h, actor, workspace, alpha } = await withUser();
        h.db.insert('authToken', { workspaceId: workspace.id, userId: 'BS23002', type: 'PASSWORD_RESET', tokenHash: 'h1', expiresAt: new Date(Date.now() + 60_000) });

        await h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { email: 'moved@example.com' }));

        expect(h.db.rows('authToken')[0].usedAt).toBeInstanceOf(Date);
    });

    it('a new temporary password is a reset: must change it, every session ends, the credentials are mailed, the new one works', async () => {
        const { h, actor, alpha } = await withUser();
        await h.service.login({ identifier: 'BS23002', password: TEMP });
        expect(h.db.rows('session').filter((x) => x.endedAt === null)).toHaveLength(1);

        const result = await h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { temporaryPassword: NEW_PASSWORD }));

        expect(result).toMatchObject({ passwordReset: true, emailSent: false });
        expect(h.db.rows('session').filter((x) => x.endedAt === null)).toHaveLength(0);
        expect(h.mail.send).toHaveBeenCalledTimes(2);
        expect(h.mail.send.mock.calls[1][0].text).toContain(NEW_PASSWORD);
        await expect(h.service.login({ identifier: 'BS23002', password: TEMP })).rejects.toThrow('Invalid credentials.');
        const login = await h.service.login({ identifier: 'BS23002', password: NEW_PASSWORD });
        expect(login.user).toMatchObject({ id: 'BS23002', mustChangePassword: true });
        expect(JSON.stringify([h.db.rows('notification'), h.db.rows('outboxEvent')])).not.toContain(NEW_PASSWORD);
    });

    it('refuses a weak temporary password and changes nothing', async () => {
        const { h, actor, alpha } = await withUser();

        await expect(
            h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { temporaryPassword: 'short' })),
        ).rejects.toThrow(BadRequestException);
        expect(h.db.rows('user')[1].name).toBe('New Trainee');
    });

    it('validates the departure date: after onboarding, not in the past when changed, not removable once set', async () => {
        const { h, actor, alpha } = await withUser();
        const bad = (overrides: Record<string, unknown>) =>
            expect(h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], overrides))).rejects.toThrow(BadRequestException);

        await bad({ departureDate: '2026-02-01' }); // not after the onboarding date
        await bad({ departureDate: '2026-02-02' }); // changed, and already past
        await bad({ departureDate: '' }); // a set date cannot be removed
        await bad({ departureDate: 'not-a-date' });
        await bad({ onboardDate: '2026-13-40' });
        expect(h.db.rows('user')[1].name).toBe('New Trainee');
    });

    it('an archived user needs a new date after today, and saving it moves them back to All Users', async () => {
        const { h, actor, alpha } = await withUser();
        await h.db.user.update({ where: { userId: 'BS23002' }, data: { archivedAt: new Date() } });

        expect((await h.provisioning.getTrainee(actor, 'BS23002')).archived).toBe(true);
        for (const departureDate of ['2026-02-02', '']) {
            await expect(
                h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id], { departureDate })),
            ).rejects.toThrow('Set a new departure date after today');
        }

        const result = await h.provisioning.updateTrainee(actor, 'BS23002', formOf([alpha.id]));

        expect(result.reactivated).toBe(true);
        expect(h.db.rows('user')[1].archivedAt).toBeNull();
    });

    it('only the acting PM can edit, and only a user that PM manages: others get 403 or the same 404 as an unknown user', async () => {
        const { h, actor, user, workspace, alpha } = await withUser();
        const other = h.db.addWorkspace({ slug: 'other' });
        h.db.addPm('hash', { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
        h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'pm050@bs23.test' });

        const asUser = { sub: user.userId as string, role: 'TRAINEE' as const, workspaceId: user.workspaceId as string };
        await expect(h.provisioning.updateTrainee(asUser, 'BS23002', formOf([alpha.id]))).rejects.toThrow(ForbiddenException);
        await expect(h.provisioning.getTrainee(asUser, 'BS23002')).rejects.toThrow(ForbiddenException);
        // Another PM of the same workspace, a PM of another workspace, and an unknown ID.
        for (const who of [
            { sub: 'PM002', role: 'PM' as const, workspaceId: workspace.id as string },
            { sub: 'PM050', role: 'PM' as const, workspaceId: other.id as string },
        ]) {
            await expect(h.provisioning.updateTrainee(who, 'BS23002', formOf([alpha.id]))).rejects.toThrow('User not found.');
            await expect(h.provisioning.getTrainee(who, 'BS23002')).rejects.toThrow('User not found.');
        }
        await expect(h.provisioning.updateTrainee(actor, 'BS99999', formOf([alpha.id]))).rejects.toThrow('User not found.');
        expect(h.db.rows('user')[1].name).toBe('New Trainee');
    });

    it('refuses a team of another PM, an archived team and no team at all', async () => {
        const { h, actor, workspace, pm, alpha } = await withUser();
        h.db.addPm('hash', { pmId: 'PM002', workspaceId: workspace.id, email: 'pm002@bs23.test' });
        const foreign = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM002', name: 'Foreign' });
        const archived = h.db.addTeam({ workspaceId: workspace.id, pmId: pm.pmId, name: 'Old', archivedAt: new Date() });

        for (const teamIds of [[foreign.id], [alpha.id, foreign.id], [archived.id], []]) {
            await expect(h.provisioning.updateTrainee(actor, 'BS23002', formOf(teamIds))).rejects.toThrow(BadRequestException);
        }
        expect((await h.provisioning.getTrainee(actor, 'BS23002')).teamIds).toEqual([alpha.id]);
    });

    it('rolls everything back when a later step fails', async () => {
        const { h, actor, alpha, beta } = await withUser();
        const original = h.db.membership.create.bind(h.db.membership);

        h.db.membership.create = async () => {
            throw new Error('boom');
        };
        await expect(
            h.provisioning.updateTrainee(actor, 'BS23002', formOf([beta.id], { temporaryPassword: NEW_PASSWORD })),
        ).rejects.toThrow('boom');
        h.db.membership.create = original;

        expect(h.db.rows('user')[1]).toMatchObject({ name: 'New Trainee', position: 'BACKEND' });
        expect((await h.provisioning.getTrainee(actor, 'BS23002')).teamIds).toEqual([alpha.id]);
        await expect(h.service.login({ identifier: 'BS23002', password: TEMP })).resolves.toBeDefined();
    });
});

describe('an email, a PM ID and a User ID are unique in the whole system', () => {
    it('the database rule covers every workspace and both tables, in any letter case', async () => {
        const { h, workspace } = await setup();
        const other = h.db.addWorkspace({ slug: 'other' });

        // Same email: another workspace, other table, other case. All refused by the trigger.
        expect(() => h.db.addPm('hash', { pmId: 'PM050', workspaceId: other.id, email: 'PM001@bs23.test' })).toThrow(/already used by a PM/);
        expect(() => h.db.addUser('hash', { userId: 'BS23050', workspaceId: other.id, pmId: 'PM001', email: 'PM001@BS23.test' })).toThrow(/already used by a PM/);
        expect(() => h.db.addPm('hash', { pmId: 'PM051', workspaceId: other.id, email: 'bs23001@bs23.test' })).toThrow(/already used by a User/);
        expect(() => h.db.addUser('hash', { userId: 'BS23051', workspaceId: other.id, pmId: 'PM001', email: 'BS23001@bs23.test' })).toThrow(/already used by a User/);
        // The IDs are primary keys: a second PM001 or BS23001 cannot exist, in any workspace.
        expect(() => h.db.addPm('hash', { pmId: 'PM001', workspaceId: other.id, email: 'x1@example.com' })).toThrow();
        expect(() => h.db.addUser('hash', { userId: 'BS23001', workspaceId: other.id, pmId: 'PM001', email: 'x2@example.com' })).toThrow();
        expect(h.db.rows('pm')).toHaveLength(1);
        expect(h.db.rows('user')).toHaveLength(1);
        expect(workspace.id).not.toBe(other.id);
    });

    it('a User ID can never look like a PM ID, and a PM ID must be PM + number (so the two ID spaces never meet)', async () => {
        const { h, actor, workspace, pm } = await setup();
        const team = h.db.addTeam({ workspaceId: workspace.id, pmId: pm.pmId });
        const user = (userId: string) => ({
            userId,
            name: 'X',
            email: `${userId.toLowerCase()}@example.com`,
            temporaryPassword: TEMP,
            position: 'QA',
            attendanceMode: 'ONLINE',
            onboardDate: '2026-02-01',
            departureDate: isoDay(365),
            skillAssessmentMinutes: 10,
            skillAssessmentMarks: 10,
            teamIds: [team.id],
        });

        await expect(h.provisioning.createTrainee(actor, user('PM077'))).rejects.toThrow(BadRequestException);
        await expect(h.provisioning.createTrainee(actor, user('pm077'))).rejects.toThrow(BadRequestException);
        await expect(h.provisioning.createPm(actor, newPm({ pmId: 'BS23077' }))).rejects.toThrow(BadRequestException);
        await expect(h.provisioning.createPm(actor, newPm({ pmId: 'pm077' }))).rejects.toThrow(BadRequestException);
        // The ID is upper-cased, so "bs23001" is the existing BS23001.
        await expect(h.provisioning.createTrainee(actor, user('bs23001'))).rejects.toThrow('Trainee ID already exists.');
    });
});

describe('invitations are stopped (the approved schema cannot separate them from password reset)', () => {
    it('Add PM and Add Trainee create no PASSWORD_RESET token, so no reset-type token can be used to activate or take over a new account', async () => {
        const { h, actor, workspace } = await setup();
        const team = h.db.addTeam({ workspaceId: workspace.id, pmId: 'PM001' });

        await h.provisioning.createPm(actor, newPm());
        await h.provisioning.createTrainee(actor, {
            userId: 'BS23002', name: 'T', email: 't@example.com', temporaryPassword: TEMP,
            position: 'QA', attendanceMode: 'PHYSICAL', onboardDate: '2026-02-01', departureDate: isoDay(100),
            skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [team.id],
        });

        expect(h.db.rows('authToken')).toHaveLength(0);
    });

    it('the service has no invitation entry points', async () => {
        const { h } = await setup();

        expect((h.provisioning as unknown as Record<string, unknown>).invite).toBeUndefined();
        expect((h.service as unknown as Record<string, unknown>).activateInvitation).toBeUndefined();
    });
});

describe('provisionInitialPm (operator command, no HTTP route)', () => {
    const input = {
        workspaceName: 'BS23 Training',
        pmName: 'First PM',
        email: 'First.PM@Example.com',
        password: TEMP,
    };

    it('creates a workspace and a verified PM that must change the password', async () => {
        const h = await makeHarness();

        const result = await provisionInitialPm(h.db as never, input);

        expect(result.pmId).toBe('PM001');
        expect(h.db.rows('workspace')[0].slug).toMatch(/^bs23-training-[0-9a-f]{6}$/);
        expect(h.db.rows('pm')[0]).toMatchObject({
            email: 'first.pm@example.com',
            emailVerified: true,
            mustChangePassword: true,
            workspaceId: result.workspaceId,
        });
        const login = await h.service.login({ identifier: 'first.pm@example.com', password: TEMP });
        expect(login.user).toMatchObject({ id: 'PM001', role: 'PM', mustChangePassword: true });
    });

    it('refuses to run once any PM exists, so it cannot be used to add accounts later', async () => {
        const h = await makeHarness();
        await seedAccounts(h);

        await expect(provisionInitialPm(h.db as never, input)).rejects.toThrow('A PM account already exists.');
        expect(h.db.rows('pm')).toHaveLength(1);
    });

    it('validates the input and rejects an email already used by a user', async () => {
        const h = await makeHarness();

        await expect(provisionInitialPm(h.db as never, { ...input, email: 'nope' })).rejects.toThrow('valid PM email');
        await expect(provisionInitialPm(h.db as never, { ...input, password: 'short' })).rejects.toThrow('at least 8');
        await expect(provisionInitialPm(h.db as never, { ...input, pmId: 'X1' })).rejects.toThrow('PM ID');
        await expect(provisionInitialPm(h.db as never, { ...input, workspaceName: ' ' })).rejects.toThrow('Workspace name');
        expect(h.db.rows('pm')).toHaveLength(0);
    });
});

describe('the public API surface', () => {
    // Reads the controller source, so it runs the same in any test runner.
    const source = readFileSync(new URL('./identity.controller.ts', import.meta.url), 'utf8');
    const routes = [...source.matchAll(/@(Get|Post|Put|Patch|Delete)\('([^']*)'\)/g)]
        .map((match) => `${match[1].toUpperCase()} /auth/${match[2]}`)
        .sort();

    it('has no PM sign-up, no invitation route and no public account-creation route', () => {
        for (const route of routes) {
            expect(route).not.toMatch(/register|signup|sign-up|invit/i);
        }
        expect(source).not.toMatch(/setInitialCredential|activateInvitation|InviteDto/);
    });

    it('exposes exactly the documented routes under /auth', () => {
        expect(source).toContain("@Controller('auth')");
        expect(routes).toEqual(
            [
                'GET /auth/accounts/trainees/:userId',
                'GET /auth/me',
                'GET /auth/sessions',
                'PATCH /auth/accounts/trainees/:userId',
                'POST /auth/accounts/pms',
                'POST /auth/accounts/trainees',
                'POST /auth/accounts/:accountId/resend-email',
                'GET /auth/me/photo',
                'PUT /auth/me/photo',
                'DELETE /auth/me/photo',
                'PATCH /auth/me/profile',
                'POST /auth/login',
                'POST /auth/logout',
                'POST /auth/password/change',
                'POST /auth/password/forgot',
                'POST /auth/password/reset',
                'POST /auth/refresh',
                'DELETE /auth/sessions/:sessionId',
            ].sort(),
        );
    });

    it('both account-creation routes are PM-only behind JwtAuthGuard + RolesGuard', () => {
        for (const path of ['accounts/pms', 'accounts/trainees']) {
            const start = source.indexOf(`@Post('${path}')`);
            const block = source.slice(start, source.indexOf('(@Body', start));

            expect(block).toMatch(/@UseGuards\(RateLimitGuard, JwtAuthGuard, RolesGuard\)/);
            expect(block).toMatch(/@Roles\('PM'\)/);
        }

        // The actor always comes from the verified token, never from the body.
        expect(source).toMatch(/createPm\(req\.user, dto\)/);
        expect(source).toMatch(/createTrainee\(req\.user, dto\)/);
    });
});
