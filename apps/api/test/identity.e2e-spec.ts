/**
 * E01 identity integration tests against a REAL PostgreSQL database with the
 * approved schema and migration applied.
 *
 * NOT RUN BY DEFAULT. They only run when you point them at a throw-away TEST
 * database, because they write rows (all inside their own workspace, removed
 * again at the end):
 *
 *   TEST_DATABASE_URL="postgresql://.../bs23_test" E2E_CONFIRM_TEST_DB=yes \
 *     pnpm --filter api test:e2e
 *
 * Safety: the database name must contain "test" and E2E_CONFIRM_TEST_DB must be
 * "yes". Never point this at the shared / central database. The migration must
 * already be applied by whoever owns that database (these tests never migrate).
 *
 * What they prove that the unit tests cannot (the unit tests use an in-memory
 * fake, which is not Prisma): the generated client accepts every identity
 * query, transactions roll back, unique and CHECK constraints behave as the
 * code assumes, the database email trigger's error is recognised, and the
 * single-use / rotation claims hold under real concurrency.
 */

import { randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { AccountProvisioningService } from '../src/modules/identity/account-provisioning.service.js';
import { IdentityService } from '../src/modules/identity/identity.service.js';
import { archiveDepartedUsers, countDepartedUsers } from '../src/modules/identity/lifecycle.js';
import type { MailService } from '../src/modules/identity/mail.service.js';
import { hashPassword } from '../src/modules/identity/password.js';
import { isEmailTriggerError, isUniqueViolation } from '../src/modules/identity/provisioning.js';

const url = process.env['TEST_DATABASE_URL'];
const confirmed = process.env['E2E_CONFIRM_TEST_DB'] === 'yes';

function assertSafe(connection: string) {
    const name = new URL(connection).pathname.replace(/^\//, '');

    if (!/test/i.test(name) || !confirmed) {
        throw new Error(
            'Refusing to run: TEST_DATABASE_URL must name a database containing "test" and E2E_CONFIRM_TEST_DB must be "yes".',
        );
    }
}

if (url) {
    assertSafe(url);
}

const suite = url ? describe : describe.skip;

const PASSWORD = 'Passw0rd!x1';
const NEW_PASSWORD = 'N3wPassw0rd!y2';

suite('identity against real PostgreSQL', () => {
    const run = randomBytes(3).toString('hex');
    const number = () => String(Math.floor(100000 + Math.random() * 899999));
    const pmId = `PM9${number()}`;
    const otherPmId = `PM9${number()}`;
    const userId = `BS239${number()}`;
    const otherUserId = `BS239${number()}`;
    const pmEmail = `e2e-pm-${run}@example.test`;
    const userEmail = `e2e-user-${run}@example.test`;

    let prisma: PrismaService;
    let service: IdentityService;
    let provisioning: AccountProvisioningService;
    let workspaceId: string;
    let otherWorkspaceId: string;
    const mail = { send: async () => ({ delivered: false, transport: 'console' as const }) };

    beforeAll(async () => {
        const config = new ConfigService({
            DATABASE_URL: url,
            JWT_ACCESS_SECRET: 'a'.repeat(40),
            JWT_REFRESH_SECRET: 'r'.repeat(40),
            WEB_APP_URL: 'http://localhost:3000',
            IDENTITY_EXPOSE_DEV_TOKENS: 'true',
        });
        prisma = new PrismaService(config);
        service = new IdentityService(prisma, new JwtService(), config, mail as unknown as MailService);
        provisioning = new AccountProvisioningService(prisma, config, mail as unknown as MailService);

        const passwordHash = await hashPassword(PASSWORD);
        const ws = await prisma.workspace.create({ data: { name: `e2e ${run}`, slug: `e2e-${run}` } });
        const other = await prisma.workspace.create({ data: { name: `e2e other ${run}`, slug: `e2e-other-${run}` } });
        workspaceId = ws.id;
        otherWorkspaceId = other.id;

        await prisma.pm.create({
            data: { pmId, workspaceId, name: 'E2E PM', email: pmEmail, emailVerified: true },
        });
        await prisma.credential.create({ data: { workspaceId, pmId, passwordHash } });
        await prisma.pm.create({
            data: { pmId: otherPmId, workspaceId: otherWorkspaceId, name: 'Other PM', email: `other-${run}@example.test`, emailVerified: true },
        });

        for (const [id, ws2, owner] of [
            [userId, workspaceId, pmId],
            [otherUserId, otherWorkspaceId, otherPmId],
        ] as const) {
            await prisma.user.create({
                data: {
                    userId: id,
                    workspaceId: ws2,
                    name: 'E2E User',
                    email: id === userId ? userEmail : `other-user-${run}@example.test`,
                    emailVerified: true,
                    resource: 'TRAINEE',
                    pmId: owner,
                    position: 'BACKEND',
                    attendanceMode: 'ONLINE',
                    onboardDate: new Date('2026-01-01T00:00:00Z'),
                },
            });
        }
        await prisma.credential.create({ data: { workspaceId, userId, passwordHash } });
    }, 60_000);

    afterAll(async () => {
        for (const id of [workspaceId, otherWorkspaceId].filter(Boolean)) {
            await prisma.notification.deleteMany({ where: { workspaceId: id } });
            await prisma.outboxEvent.deleteMany({ where: { workspaceId: id } });
            await prisma.session.deleteMany({ where: { workspaceId: id } });
            await prisma.authToken.deleteMany({ where: { workspaceId: id } });
            await prisma.credential.deleteMany({ where: { workspaceId: id } });
            await prisma.membership.deleteMany({ where: { workspaceId: id } });
            await prisma.team.deleteMany({ where: { workspaceId: id } });
            await prisma.user.deleteMany({ where: { workspaceId: id } });
            await prisma.pm.deleteMany({ where: { workspaceId: id } });
            await prisma.workspace.delete({ where: { id } });
        }
        await prisma.$disconnect();
    });

    it('PM signs in with email, a Trainee with the Trainee ID; a trainee email and a PM ID are rejected', async () => {
        const pm = await service.login({ identifier: pmEmail.toUpperCase(), password: PASSWORD });
        const trainee = await service.login({ identifier: userId.toLowerCase(), password: PASSWORD });

        expect(pm.user).toMatchObject({ id: pmId, role: 'PM' });
        expect(trainee.user).toMatchObject({ id: userId, role: 'TRAINEE' });
        await expect(service.login({ identifier: userEmail, password: PASSWORD })).rejects.toThrow('Invalid credentials.');
        await expect(service.login({ identifier: pmId, password: PASSWORD })).rejects.toThrow('Invalid credentials.');
        await expect(service.login({ identifier: pmEmail, password: 'WrongPass123' })).rejects.toThrow('Invalid credentials.');
    }, 30_000);

    it('the spread-built Session / AuthToken / Credential creates work and keep exactly one owner', async () => {
        const login = await service.login({ identifier: userId, password: PASSWORD });
        const session = await prisma.session.findFirstOrThrow({ where: { userId, workspaceId }, orderBy: { createdAt: 'desc' } });
        expect(session).toMatchObject({ userId, pmId: null, endedAt: null });
        expect(login.refreshToken).not.toBe(session.tokenHash);

        const forgot = await service.forgotPassword({ workEmail: userEmail });
        const token = await prisma.authToken.findFirstOrThrow({ where: { userId, type: 'PASSWORD_RESET' } });
        expect(token).toMatchObject({ pmId: null, usedAt: null });

        await service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
        const credential = await prisma.credential.findUniqueOrThrow({ where: { userId } });
        expect(credential.passwordChangedAt).not.toBeNull();
        // Put the original password back for the other tests.
        await prisma.credential.update({ where: { userId }, data: { passwordHash: await hashPassword(PASSWORD) } });
    }, 30_000);

    it('the database CHECK refuses a row with both owners or none', async () => {
        const passwordHash = await hashPassword(PASSWORD);

        await expect(
            prisma.credential.create({ data: { workspaceId, pmId: otherPmId, userId: otherUserId, passwordHash } }),
        ).rejects.toThrow();
        await expect(prisma.credential.create({ data: { workspaceId, passwordHash } })).rejects.toThrow();
    });

    it('unique violations surface as P2002 and the email trigger error is recognised', async () => {
        let duplicate: unknown;
        try {
            await prisma.pm.create({ data: { pmId, workspaceId, name: 'x', email: `dup-${run}@example.test` } });
        } catch (error) {
            duplicate = error;
        }
        expect(isUniqueViolation(duplicate)).toBe(true);

        // A user may not take a PM's email in the same workspace (trigger trg_user_email).
        let trigger: unknown;
        try {
            await prisma.user.create({
                data: {
                    userId: `BS239${number()}`,
                    workspaceId,
                    name: 'x',
                    email: pmEmail,
                    resource: 'TRAINEE',
                    pmId,
                    position: 'BACKEND',
                    attendanceMode: 'ONLINE',
                    onboardDate: new Date('2026-01-01T00:00:00Z'),
                },
            });
        } catch (error) {
            trigger = error;
        }
        expect(trigger).toBeDefined();
        expect(isEmailTriggerError(trigger)).toBe(true);
    });

    it('a failed transaction leaves no rows behind', async () => {
        const ghost = `PM9${number()}`;

        await expect(
            prisma.$transaction(async (tx) => {
                await tx.pm.create({ data: { pmId: ghost, workspaceId, name: 'Ghost', email: `ghost-${run}@example.test` } });
                throw new Error('rollback please');
            }),
        ).rejects.toThrow('rollback please');

        expect(await prisma.pm.findUnique({ where: { pmId: ghost } })).toBeNull();
    });

    it('Add PM creates a PM in the actor\'s workspace with a notification and an outbox event; an unrelated actor is refused', async () => {
        const actor = { sub: pmId, role: 'PM' as const, workspaceId };
        const newId = `PM9${number()}`;
        const email = `added-${run}@example.test`;

        const created = await provisioning.createPm(actor, { pmId: newId, name: 'Added PM', email, password: PASSWORD });
        expect(created).toMatchObject({ pmId: newId, workspaceId, mustChangePassword: true });
        // Real tables: Notification (recipient = the new PM) and OutboxEvent were written in the same transaction.
        expect(await prisma.notification.findFirstOrThrow({ where: { pmId: newId } })).toMatchObject({ workspaceId, userId: null });
        const outbox = await prisma.outboxEvent.findFirstOrThrow({ where: { workspaceId, type: 'auth.account_created' } });
        expect(outbox).toMatchObject({ status: 'PENDING', attempts: 0 });
        expect(JSON.stringify(outbox.payload)).not.toContain(email);

        // No email verification: the new PM can sign in at once.
        expect((await service.login({ identifier: email, password: PASSWORD })).user.mustChangePassword).toBe(true);

        await expect(
            provisioning.createPm({ sub: userId, role: 'PM', workspaceId }, { pmId: `PM9${number()}`, name: 'x', email: `x-${run}@example.test`, password: PASSWORD }),
        ).rejects.toThrow('Only a PM of this workspace');
    }, 30_000);

    it('Add Trainee writes User + Membership + Credential + Notification + OutboxEvent in one real transaction; the account is active at once', async () => {
        const actor = { sub: pmId, role: 'PM' as const, workspaceId };
        const team = await prisma.team.create({ data: { workspaceId, name: `Team ${run}`, pmId } });
        const foreignTeam = await prisma.team.create({ data: { workspaceId: otherWorkspaceId, name: `Foreign ${run}`, pmId: otherPmId } });
        const base = {
            position: 'QA', attendanceMode: 'PHYSICAL', onboardDate: '2026-02-01', departureDate: '2099-01-01',
            skillAssessmentMinutes: 60, skillAssessmentMarks: 100, temporaryPassword: PASSWORD, teamIds: [team.id],
        };
        const tempId = `BS239${number()}`;

        const temp = await provisioning.createTrainee(actor, {
            ...base, userId: tempId, name: 'Temp Trainee', email: `temp-${run}@example.test`,
        });
        expect(temp).toMatchObject({ userId: tempId, workspaceId, pmId, active: true, mustChangePassword: true });
        expect(await prisma.membership.count({ where: { userId: tempId, teamId: team.id } })).toBe(1);
        expect(await prisma.credential.count({ where: { userId: tempId } })).toBe(1);
        expect(await prisma.authToken.count({ where: { userId: tempId } })).toBe(0);
        expect(await prisma.notification.findFirstOrThrow({ where: { userId: tempId } })).toMatchObject({ workspaceId, pmId: null });
        const row = await prisma.user.findUniqueOrThrow({ where: { userId: tempId } });
        expect(row).toMatchObject({ pmId, workspaceId, skillAssessmentMinutes: 60, skillAssessmentMarks: 100, mustChangePassword: true });
        expect(row.departureDate?.toISOString().slice(0, 10)).toBe('2099-01-01');
        expect((await service.login({ identifier: tempId.toLowerCase(), password: PASSWORD })).user).toMatchObject({ role: 'TRAINEE', mustChangePassword: true });

        // Isolation and rollback: a team of another workspace is refused, and a duplicate email creates nothing.
        const before = await prisma.user.count({ where: { workspaceId } });
        await expect(
            provisioning.createTrainee(actor, { ...base, teamIds: [foreignTeam.id], userId: `BS239${number()}`, name: 'x', email: `x1-${run}@example.test` }),
        ).rejects.toThrow('One or more teams were not found.');
        await expect(
            provisioning.createTrainee(actor, { ...base, userId: `BS239${number()}`, name: 'x', email: userEmail }),
        ).rejects.toThrow('Email is already in use.');
        expect(await prisma.user.count({ where: { workspaceId } })).toBe(before);
    }, 60_000);

    it('an email is unique in the whole system: the real triggers refuse it across workspaces, tables and letter case', async () => {
        const newPm = (id: string, ws: string, email: string) =>
            prisma.pm.create({ data: { pmId: id, workspaceId: ws, name: 'x', email, emailVerified: true } });
        const newUser = (id: string, ws: string, owner: string, email: string) =>
            prisma.user.create({
                data: {
                    userId: id, workspaceId: ws, name: 'x', email, resource: 'TRAINEE', pmId: owner,
                    position: 'BACKEND', attendanceMode: 'ONLINE', onboardDate: new Date('2026-01-01T00:00:00Z'),
                },
            });
        const refused = async (action: Promise<unknown>) => {
            let error: unknown;
            try {
                await action;
            } catch (e) {
                error = e;
            }
            expect(isEmailTriggerError(error)).toBe(true);
        };

        // Another workspace, any table, any letter case: all refused (they were allowed before the migration).
        await refused(newPm(`PM9${number()}`, otherWorkspaceId, pmEmail.toUpperCase())); // PM, same email as a PM
        await refused(newUser(`BS239${number()}`, otherWorkspaceId, otherPmId, pmEmail)); // User takes a PM's email
        await refused(newPm(`PM9${number()}`, otherWorkspaceId, userEmail)); // PM takes a User's email
        await refused(newUser(`BS239${number()}`, otherWorkspaceId, otherPmId, userEmail.toUpperCase())); // User, same email as a User
        // An UPDATE of the email is guarded too, and keeping the own email is fine.
        await refused(prisma.pm.update({ where: { pmId: otherPmId }, data: { email: userEmail } }));
        await refused(prisma.user.update({ where: { userId: otherUserId }, data: { email: pmEmail } }));
        await prisma.pm.update({ where: { pmId: pmId }, data: { email: pmEmail } });

        // Through the service, the same rule is a clean 409.
        const actor = { sub: pmId, role: 'PM' as const, workspaceId };
        await expect(
            provisioning.createPm(actor, { pmId: `PM9${number()}`, name: 'x', email: `other-user-${run}@example.test`, password: PASSWORD }),
        ).rejects.toThrow('Email is already in use.');
        // The IDs are primary keys: a second PM or User with an existing ID is refused whatever the workspace.
        await expect(newPm(pmId, otherWorkspaceId, `fresh-${run}@example.test`)).rejects.toSatisfy(isUniqueViolation);
        await expect(newUser(userId, otherWorkspaceId, otherPmId, `fresh2-${run}@example.test`)).rejects.toSatisfy(isUniqueViolation);
    }, 60_000);

    it('Edit User against the real database: fields, memberships, email rule, password reset, PM scope', async () => {
        const actor = { sub: pmId, role: 'PM' as const, workspaceId };
        const alpha = await prisma.team.create({ data: { workspaceId, name: `EditA ${run}`, pmId } });
        const beta = await prisma.team.create({ data: { workspaceId, name: `EditB ${run}`, pmId } });
        const id = `BS239${number()}`;
        await provisioning.createTrainee(actor, {
            userId: id, name: 'Before', email: `before-${run}@example.test`, temporaryPassword: PASSWORD,
            position: 'QA', attendanceMode: 'PHYSICAL', onboardDate: '2026-02-01', departureDate: '2099-01-01',
            skillAssessmentMinutes: 60, skillAssessmentMarks: 100, teamIds: [alpha.id],
        });
        const form = (teamIds: string[], o: Record<string, unknown> = {}) => ({
            name: 'After', email: `after-${run}@example.test`, position: 'BACKEND', attendanceMode: 'ONLINE', resource: 'SBU',
            onboardDate: '2026-02-01', departureDate: '2099-06-01', skillAssessmentMinutes: 20, skillAssessmentMarks: 40, teamIds, ...o,
        });

        expect(await provisioning.getTrainee(actor, id)).toMatchObject({ name: 'Before', departureDate: '2099-01-01', teamIds: [alpha.id], archived: false });

        // Email rule (a PM of another workspace owns it) and PM scope: nothing changes.
        await expect(provisioning.updateTrainee(actor, id, form([beta.id], { email: `other-${run}@example.test` }))).rejects.toThrow('Email is already in use.');
        await expect(
            provisioning.updateTrainee({ sub: otherPmId, role: 'PM', workspaceId: otherWorkspaceId }, id, form([beta.id])),
        ).rejects.toThrow('User not found.');
        expect(await prisma.user.findUniqueOrThrow({ where: { userId: id } })).toMatchObject({ name: 'Before', email: `before-${run}@example.test` });

        // A real edit with a password reset, in one transaction.
        await service.login({ identifier: id, password: PASSWORD });
        const result = await provisioning.updateTrainee(actor, id, form([beta.id], { temporaryPassword: NEW_PASSWORD }));

        expect(result).toMatchObject({ userId: id, resource: 'SBU', teamIds: [beta.id], passwordReset: true, reactivated: false });
        expect(await prisma.user.findUniqueOrThrow({ where: { userId: id } })).toMatchObject({
            pmId, name: 'After', email: `after-${run}@example.test`, resource: 'SBU', position: 'BACKEND', mustChangePassword: true,
            skillAssessmentMinutes: 20, skillAssessmentMarks: 40,
        });
        const memberships = await prisma.membership.findMany({ where: { userId: id } });
        expect(memberships.find((m) => m.teamId === alpha.id)?.leftAt).not.toBeNull();
        expect(memberships.find((m) => m.teamId === beta.id)?.leftAt).toBeNull();
        expect(await prisma.session.count({ where: { userId: id, endedAt: null } })).toBe(0);
        await expect(service.login({ identifier: id, password: PASSWORD })).rejects.toThrow('Invalid credentials.');
        expect((await service.login({ identifier: id, password: NEW_PASSWORD })).user).toMatchObject({ id, role: 'SBU', mustChangePassword: true });
    }, 60_000);

    it('PM scope: a PM cannot use another PM\'s team in the SAME workspace', async () => {
        const second = `PM9${number()}`;
        await prisma.pm.create({ data: { pmId: second, workspaceId, name: 'Second PM', email: `second-${run}@example.test`, emailVerified: true } });
        const theirs = await prisma.team.create({ data: { workspaceId, name: `Theirs ${run}`, pmId: second } });
        const before = await prisma.user.count({ where: { workspaceId } });

        await expect(
            provisioning.createTrainee(
                { sub: pmId, role: 'PM', workspaceId },
                {
                    userId: `BS239${number()}`, name: 'x', email: `scope-${run}@example.test`, temporaryPassword: PASSWORD,
                    position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: '2099-01-01',
                    skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [theirs.id],
                },
            ),
        ).rejects.toThrow('One or more teams were not found.');
        expect(await prisma.user.count({ where: { workspaceId } })).toBe(before);
    }, 30_000);

    it('a Trainee and a PM of another workspace cannot create accounts', async () => {
        const team = await prisma.team.findFirstOrThrow({ where: { workspaceId, pmId } });
        const input = {
            userId: `BS239${number()}`, name: 'x', email: `deny-${run}@example.test`, temporaryPassword: PASSWORD,
            position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01', departureDate: '2099-01-01',
            skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [team.id],
        };

        await expect(provisioning.createTrainee({ sub: userId, role: 'TRAINEE', workspaceId }, input)).rejects.toThrow('Only a PM of this workspace');
        // The other workspace's PM claims our workspace: the database says it belongs elsewhere.
        await expect(provisioning.createTrainee({ sub: otherPmId, role: 'PM', workspaceId }, input)).rejects.toThrow('Only a PM of this workspace');
        // And acting in its own workspace, it cannot use our team.
        await expect(
            provisioning.createTrainee({ sub: otherPmId, role: 'PM', workspaceId: otherWorkspaceId }, input),
        ).rejects.toThrow('One or more teams were not found.');
    }, 30_000);

    it('the first-login password change and a password reset write their outbox events in the real database', async () => {
        const trainee = await service.login({ identifier: userId, password: PASSWORD });
        const session = await prisma.session.findFirstOrThrow({ where: { userId, workspaceId }, orderBy: { createdAt: 'desc' } });
        const before = await prisma.outboxEvent.count({ where: { workspaceId, type: 'auth.password_changed' } });

        await service.changePassword('TRAINEE', userId, workspaceId, session.id, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

        expect(trainee.user.id).toBe(userId);
        expect(await prisma.outboxEvent.count({ where: { workspaceId, type: 'auth.password_changed' } })).toBe(before + 1);
        await prisma.credential.update({ where: { userId }, data: { passwordHash: await hashPassword(PASSWORD) } });
    }, 30_000);

    it('the departure-date job archives a departed user, ends the sessions and leaves other users alone (real database)', async () => {
        const departedId = `BS239${number()}`;
        const passwordHash = await hashPassword(PASSWORD);
        await prisma.user.create({
            data: {
                userId: departedId, workspaceId, name: 'Departed', email: `departed-${run}@example.test`,
                emailVerified: true, resource: 'TRAINEE', pmId, position: 'QA', attendanceMode: 'ONLINE',
                onboardDate: new Date('2026-01-01T00:00:00Z'), departureDate: new Date('2026-02-01T00:00:00Z'),
            },
        });
        await prisma.credential.create({ data: { workspaceId, userId: departedId, passwordHash } });
        await prisma.session.create({
            data: { workspaceId, userId: departedId, tokenHash: `e2e-${run}-${departedId}`, device: 'e2e', expiresAt: new Date(Date.now() + 3_600_000) },
        });

        expect(await countDepartedUsers(prisma)).toBeGreaterThanOrEqual(1);
        await archiveDepartedUsers(prisma);

        const departed = await prisma.user.findUniqueOrThrow({ where: { userId: departedId } });
        expect(departed.archivedAt).not.toBeNull();
        expect(await prisma.session.count({ where: { userId: departedId, endedAt: null } })).toBe(0);
        expect((await prisma.user.findUniqueOrThrow({ where: { userId } })).archivedAt).toBeNull();
        await expect(service.login({ identifier: departedId, password: PASSWORD })).rejects.toThrow('This account is inactive');
    }, 30_000);

    it('refresh rotates, a replayed token is theft, and two parallel refreshes cannot both win', async () => {
        const first = await service.login({ identifier: pmEmail, password: PASSWORD });
        const second = await service.refresh(first.refreshToken);
        expect(second.refreshToken).not.toBe(first.refreshToken);
        await expect(service.refresh(first.refreshToken)).rejects.toThrow();
        await expect(service.refresh(second.refreshToken)).rejects.toThrow(); // every session was ended

        const fresh = await service.login({ identifier: pmEmail, password: PASSWORD });
        const results = await Promise.allSettled([service.refresh(fresh.refreshToken), service.refresh(fresh.refreshToken)]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    }, 30_000);

    it('a reset token can be used once even when used twice at the same moment', async () => {
        const forgot = await service.forgotPassword({ workEmail: pmEmail });
        const results = await Promise.allSettled([
            service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
            service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        await prisma.credential.update({ where: { pmId }, data: { passwordHash: await hashPassword(PASSWORD) } });
    }, 30_000);
});
