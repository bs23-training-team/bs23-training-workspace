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
    it('lets an authorized PM create a PM in the SAME workspace, unverified, with the typed password', async () => {
        const { h, actor, workspace } = await setup();

        const result = await h.provisioning.createPm(actor, newPm());

        expect(result).toMatchObject({
            pmId: 'PM002',
            workspaceId: workspace.id,
            name: 'Second PM',
            email: 'second.pm@example.com',
            emailVerified: false,
            mustChangePassword: true,
        });
        expect(h.db.rows('pm')[1]).toMatchObject({
            pmId: 'PM002',
            workspaceId: workspace.id,
            emailVerified: false,
            mustChangePassword: true,
        });
        expect(h.db.rows('credential')[2]).toMatchObject({ pmId: 'PM002', userId: null });
        expect(h.db.rows('authToken')[0]).toMatchObject({
            pmId: 'PM002',
            userId: null,
            type: 'EMAIL_VERIFICATION',
            usedAt: null,
        });
        // No invitation-style token of any kind is created.
        expect(h.db.rows('authToken').filter((row) => row.type === 'PASSWORD_RESET')).toHaveLength(0);
    });

    it('stores a scrypt hash, never the password, and only the hash of the token', async () => {
        const { h, actor } = await setup();

        const result = await h.provisioning.createPm(actor, newPm());

        const credential = h.db.rows('credential')[2];
        expect(credential.passwordHash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
        expect(JSON.stringify(h.db.rows('credential'))).not.toContain(TEMP);
        expect(JSON.stringify(h.db.rows('authToken'))).not.toContain(result.verificationToken as string);
    });

    it('the new PM cannot sign in until the emailed link is used, then must change the password', async () => {
        const { h, actor } = await setup();
        const created = await h.provisioning.createPm(actor, newPm());

        await expect(
            h.service.login({ identifier: 'second.pm@example.com', password: TEMP }),
        ).rejects.toThrow('Verify your email before signing in.');

        await h.service.verifyEmail({ token: created.verificationToken as string });
        const login = await h.service.login({ identifier: 'SECOND.pm@example.com', password: TEMP });

        expect(login.user).toMatchObject({ id: 'PM002', role: 'PM', mustChangePassword: true });
    });

    it('emails the verification link, and returns the token only with the dev flag outside production', async () => {
        const { h, actor } = await setup();
        await h.provisioning.createPm(actor, newPm());
        expect(h.mail.send).toHaveBeenCalledTimes(1);

        const plain = await setup({ IDENTITY_EXPOSE_DEV_TOKENS: 'false' });
        const result = await plain.h.provisioning.createPm(plain.actor, newPm());
        expect(result.verificationToken).toBeUndefined();
        expect(result.verificationLink).toBeUndefined();
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

    it('refuses a Trainee, an unknown PM, a PM of another workspace and an unverified PM (nothing is created)', async () => {
        const { h, user, pm, actor } = await setup();
        const other = h.db.addWorkspace({ slug: 'other' });

        await expect(
            h.provisioning.createPm({ sub: user.userId, role: 'USER', workspaceId: user.workspaceId }, newPm()),
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
        h.db.rows('pm')[0].emailVerified = false;
        await expect(h.provisioning.createPm(actor, newPm())).rejects.toThrow(ForbiddenException);

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

        for (const table of ['authToken', 'notification', 'outboxEvent'] as const) {
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

    it('does not depend on email: nothing is mailed, no token is created, and the trainee signs in with the Trainee ID', async () => {
        const { h, actor, input } = await withTeam();

        await h.provisioning.createTrainee(actor, input());

        expect(h.mail.send).not.toHaveBeenCalled();
        expect(h.db.rows('authToken')).toHaveLength(0);

        const login = await h.service.login({ identifier: 'bs23002', password: TEMP });
        expect(login.user).toMatchObject({ id: 'BS23002', role: 'USER', mustChangePassword: true });
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

        await h.service.changePassword('USER', 'BS23002', first.user.workspaceId, current.id as string, {
            currentPassword: TEMP,
            newPassword: NEW_PASSWORD,
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
                payload: { accountRole: 'USER', accountId: 'BS23002', actorPmId: 'PM001' },
            },
        ]);
        const stored = JSON.stringify([h.db.rows('notification'), h.db.rows('outboxEvent')]);
        expect(stored).not.toContain(TEMP);
        expect(stored).not.toContain('new.trainee@example.com');
    });

    it('only an authorized PM may create: Trainee, unknown PM, wrong-workspace claim and unverified PM are refused (nothing is created)', async () => {
        const { h, actor, user, input } = await withTeam();
        const other = h.db.addWorkspace({ slug: 'other' });

        await expect(
            h.provisioning.createTrainee({ sub: user.userId, role: 'USER', workspaceId: user.workspaceId }, input()),
        ).rejects.toThrow(ForbiddenException);
        await expect(h.provisioning.createTrainee({ ...actor, sub: 'PM999' }, input())).rejects.toThrow(ForbiddenException);
        await expect(h.provisioning.createTrainee({ ...actor, workspaceId: other.id }, input())).rejects.toThrow(ForbiddenException);
        h.db.rows('pm')[0].emailVerified = false;
        await expect(h.provisioning.createTrainee(actor, input())).rejects.toThrow(ForbiddenException);

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

        expect(h.db.rows('authToken').map((row) => row.type)).toEqual(['EMAIL_VERIFICATION']);
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
                'GET /auth/me',
                'GET /auth/sessions',
                'POST /auth/accounts/pms',
                'POST /auth/accounts/trainees',
                'POST /auth/email/verify',
                'POST /auth/email/verify/request',
                'POST /auth/email/verify/resend',
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
