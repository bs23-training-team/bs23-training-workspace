import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FakeCalendarSource } from '../testing/fake-calendar-source.js';
import { FakeKudosPort } from '../testing/fake-kudos-port.js';
import { FakeNotificationPort } from '../testing/fake-notification-port.js';
import { FakeSprintSource } from '../testing/fake-sprint-source.js';
import { createTestPrisma } from '../testing/test-db.js';
import { StreakService } from '../streak/streak.service.js';
import { parseDay } from '../time/org-time.js';
import { BadgesService } from './badges.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace and users, removed afterwards. Calendar (Dhaka weekend = Fri + Sat):
//   Sun 15  Mon 16  Tue 17  Wed 18  Thu 19   (Nov 2026). "Today" is Thu 19.
// Users: U1 and U2 belong to PM001, U3 to PM002. Badges are created by PM001 unless said so.

const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const run = (days: number[], late: number[] = []) => days.map((n) => ({ day: d(n), onTime: !late.includes(n) }));

describe('BadgesService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const [U1, U2, U3] = [`TB1${tag}`, `TB2${tag}`, `TB3${tag}`];
  let prisma: PrismaService;
  let notices: FakeNotificationPort;
  let sprints: FakeSprintSource;
  let kudos: FakeKudosPort;
  let badges: BadgesService;
  let workspaceId: string;
  let seq = 0;

  const user = (userId: string, pmId: string) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@badge-test.invalid`,
        name: 'Badge test user',
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
      },
    });
  const special = (pmId = 'PM001') =>
    badges.create({ workspaceId, pmId, name: `Special ${++seq}`, icon: '🏅', kind: 'SPECIAL', criteria: 'Helped the team' });
  const behavioral = (ruleType: 'SPRINT_STREAK' | 'ON_TIME_SPRINT_STREAK' | 'KUDOS_DISTINCT_SENDERS', threshold: number, pmId = 'PM001') =>
    badges.create({ workspaceId, pmId, name: `Auto ${++seq}`, icon: '🔥', kind: 'BEHAVIORAL', criteria: 'Rule', ruleType, threshold });
  const award = (badgeId: string, userId = U1, evidence = 'Led the demo', pmId = 'PM001') =>
    badges.awardSpecial({ workspaceId, badgeId, userId, pmId, evidence });
  const awardRow = (badgeId: string, userId = U1) =>
    prisma.badgeAward.findUnique({ where: { badgeId_userId: { badgeId, userId } } });
  const categories = () => notices.userNotices.map((n) => n.category);

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Badges test', slug: `t-badges-${tag}` } })).id;
    await user(U1, 'PM001');
    await user(U2, 'PM001');
    await user(U3, 'PM002');
  });

  beforeEach(() => {
    notices = new FakeNotificationPort();
    sprints = new FakeSprintSource();
    kudos = new FakeKudosPort();
    const clock = { now: () => new Date('2026-11-19T06:00:00Z') };
    const streaks = new StreakService(prisma, sprints, new FakeCalendarSource(), clock);
    badges = new BadgesService(prisma, notices, streaks, kudos, clock);
  });

  afterEach(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('create and retire', () => {
    it('creates a Special badge and a Behavioral badge', async () => {
      const s = await special();
      const b = await behavioral('SPRINT_STREAK', 5);
      expect(await prisma.badge.findUniqueOrThrow({ where: { id: s.badgeId } })).toMatchObject({
        kind: 'SPECIAL',
        ruleType: 'MANUAL',
        threshold: null,
        createdById: 'PM001',
      });
      expect(await prisma.badge.findUniqueOrThrow({ where: { id: b.badgeId } })).toMatchObject({
        kind: 'BEHAVIORAL',
        ruleType: 'SPRINT_STREAK',
        threshold: 5,
      });
    });

    it('refuses a Special badge with a threshold, and a Behavioral badge without one (BADGE_RULE), and a blank name (NAME_REQUIRED)', async () => {
      const base = { workspaceId, pmId: 'PM001', icon: '🏅', criteria: 'x' };
      await expect(badges.create({ ...base, name: 'A', kind: 'SPECIAL', threshold: 3 })).rejects.toMatchObject({ code: 'BADGE_RULE' });
      await expect(badges.create({ ...base, name: 'B', kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK' })).rejects.toMatchObject({ code: 'BADGE_RULE' });
      await expect(badges.create({ ...base, name: ' ', kind: 'SPECIAL' })).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
      await expect(badges.create({ ...base, name: 'C', kind: 'TECHNICAL' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await prisma.badge.count({ where: { workspaceId } })).toBe(0);
    });

    it('the database itself rejects impossible badge combinations', async () => {
      const data = { workspaceId, icon: '🏅', criteria: 'x', createdById: 'PM001' };
      await expect(prisma.badge.create({ data: { ...data, name: 'D1', kind: 'SPECIAL', ruleType: 'MANUAL', threshold: 3 } })).rejects.toThrow();
      await expect(prisma.badge.create({ data: { ...data, name: 'D2', kind: 'BEHAVIORAL', ruleType: 'MANUAL' } })).rejects.toThrow();
      await expect(prisma.badge.create({ data: { ...data, name: 'D3', kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 0 } })).rejects.toThrow();
      await expect(prisma.badge.create({ data: { ...data, name: 'D4', kind: 'SPECIAL', retiredAt: new Date() } })).rejects.toThrow(); // retiredAt without retiredById
    });

    it('refuses a duplicate name in the workspace (NAME_TAKEN)', async () => {
      await badges.create({ workspaceId, pmId: 'PM001', name: 'Same', icon: '🏅', kind: 'SPECIAL', criteria: 'x' });
      await expect(
        badges.create({ workspaceId, pmId: 'PM001', name: 'Same', icon: '⭐', kind: 'SPECIAL', criteria: 'y' }),
      ).rejects.toMatchObject({ code: 'NAME_TAKEN' });
    });

    it('retires a badge once; a retired badge cannot be awarded, existing awards stay', async () => {
      const s = await special();
      await award(s.badgeId, U1);
      await badges.retire({ workspaceId, badgeId: s.badgeId, pmId: 'PM001' });
      expect(await prisma.badge.findUniqueOrThrow({ where: { id: s.badgeId } })).toMatchObject({ retiredById: 'PM001' });
      expect((await prisma.badge.findUniqueOrThrow({ where: { id: s.badgeId } })).retiredAt).not.toBeNull();
      await expect(badges.retire({ workspaceId, badgeId: s.badgeId, pmId: 'PM001' })).rejects.toMatchObject({ code: 'ALREADY_RETIRED' });
      await expect(award(s.badgeId, U2)).rejects.toMatchObject({ code: 'BADGE_RETIRED' });
      expect((await awardRow(s.badgeId, U1))?.revokedAt).toBeNull(); // the existing award stays
      await expect(badges.retire({ workspaceId, badgeId: randomUUID(), pmId: 'PM001' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('awardSpecial', () => {
    it('awards once: MANUAL source, evidence, the PM, a "New badge" notice, and no XP', async () => {
      const s = await special();
      const result = await award(s.badgeId, U1, '  Led the demo  ');
      expect(await prisma.badgeAward.findUniqueOrThrow({ where: { id: result.awardId } })).toMatchObject({
        source: 'MANUAL',
        evidence: 'Led the demo',
        awardedById: 'PM001',
        userId: U1,
        revokedAt: null,
      });
      expect(categories()).toEqual(['New badge']);
      expect(notices.userNotices[0]).toMatchObject({ userId: U1 });
      expect(await prisma.xpEvent.count({ where: { userId: U1 } })).toBe(0);
    });

    it('refuses a second award (ALREADY_AWARDED), and exactly one of 25 simultaneous awards wins', async () => {
      const s = await special();
      await award(s.badgeId, U1);
      await expect(award(s.badgeId, U1)).rejects.toMatchObject({ code: 'ALREADY_AWARDED' });

      const attempts = await Promise.allSettled(Array.from({ length: 25 }, () => award(s.badgeId, U2)));
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      // The losers get the clean business error, not a raw database error.
      for (const a of attempts.filter((x) => x.status === 'rejected')) {
        expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'ALREADY_AWARDED' });
      }
      expect(await prisma.badgeAward.count({ where: { badgeId: s.badgeId, userId: U2 } })).toBe(1);
    });

    it('needs evidence, a user in scope, a Special badge', async () => {
      const s = await special();
      await expect(award(s.badgeId, U1, '   ')).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
      await expect(award(s.badgeId, U3, 'x', 'PM001')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(award(s.badgeId, 'BS99999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(award(randomUUID())).rejects.toMatchObject({ code: 'NOT_FOUND' });
      const b = await behavioral('SPRINT_STREAK', 3);
      await expect(award(b.badgeId)).rejects.toMatchObject({ code: 'NOT_SPECIAL' });
      expect(await prisma.badgeAward.count({ where: { workspaceId } })).toBe(0);
    });

    it('rolls the award back when the notice fails', async () => {
      const s = await special();
      notices.failNext(new Error('outbox down'));
      await expect(award(s.badgeId)).rejects.toThrow('outbox down');
      expect(await awardRow(s.badgeId)).toBeNull();
    });
  });

  describe('revoke', () => {
    it('revokes with a reason, tells the user, and a re-award clears the revoke on the SAME row', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId);

      await badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: '  Awarded by mistake ' });
      expect(await prisma.badgeAward.findUniqueOrThrow({ where: { id: awardId } })).toMatchObject({
        revokedById: 'PM001',
        revokeReason: 'Awarded by mistake',
      });
      expect(categories()).toEqual(['New badge', 'Badge revoked']);
      expect(notices.userNotices[1]?.message).toContain('Awarded by mistake');

      const again = await award(s.badgeId, U1, 'Earned it properly');
      expect(again.awardId).toBe(awardId); // one row per badge and user, ever
      expect(await prisma.badgeAward.findUniqueOrThrow({ where: { id: awardId } })).toMatchObject({
        revokedAt: null,
        revokedById: null,
        revokeReason: null,
        evidence: 'Earned it properly',
      });
      expect(await prisma.badgeAward.count({ where: { badgeId: s.badgeId, userId: U1 } })).toBe(1);
    });

    it('needs a reason, scope, and an award that is not already revoked', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId, U1);
      await expect(badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: '  ' })).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
      await expect(badges.revoke({ workspaceId, awardId, pmId: 'PM002', reason: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(badges.revoke({ workspaceId, awardId: randomUUID(), pmId: 'PM001', reason: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: 'x' });
      await expect(badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: 'x' })).rejects.toMatchObject({ code: 'ALREADY_REVOKED' });
    });

    it('the database refuses a revoke with no reason', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId);
      await expect(
        prisma.badgeAward.update({ where: { id: awardId }, data: { revokedAt: new Date(), revokedById: 'PM001', revokeReason: '  ' } }),
      ).rejects.toThrow();
    });
  });

  describe('automatic badges (evaluateAuto)', () => {
    it('awards a sprint-streak badge once: AUTOMATIC, system evidence, awardedById is the CREATING PM, no XP', async () => {
      const b = await behavioral('SPRINT_STREAK', 3, 'PM002'); // created by PM002, user belongs to PM001
      sprints.set(U1, run([15, 16, 17]));
      notices.userNotices.length = 0;

      const first = await badges.evaluateAuto(workspaceId, U1);
      expect(first.awarded).toEqual([b.badgeId]);
      expect(await awardRow(b.badgeId)).toMatchObject({ source: 'AUTOMATIC', awardedById: 'PM002', revokedAt: null });
      expect((await awardRow(b.badgeId))?.evidence).toContain('3');
      expect(categories()).toEqual(['New badge']);

      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([]); // created once
      expect(await prisma.badgeAward.count({ where: { badgeId: b.badgeId } })).toBe(1);
      expect(await prisma.xpEvent.count({ where: { userId: U1 } })).toBe(0);
    });

    it('does not award below the threshold, and uses the LONGEST run (a later break keeps it earned)', async () => {
      const b = await behavioral('SPRINT_STREAK', 3);
      sprints.set(U1, run([15, 16]));
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([]);

      sprints.set(U1, run([15, 16, 17, 19])); // 3 in a row, then Wed 18 missed
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([b.badgeId]);
    });

    it('the on-time badge ignores late sprints', async () => {
      const b = await behavioral('ON_TIME_SPRINT_STREAK', 3);
      sprints.set(U1, run([15, 16, 17], [16])); // Monday was late
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([]);
      sprints.set(U1, run([15, 16, 17]));
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([b.badgeId]);
    });

    it('never awards a Special badge and never a retired badge', async () => {
      await special();
      const b = await behavioral('SPRINT_STREAK', 1);
      await badges.retire({ workspaceId, badgeId: b.badgeId, pmId: 'PM001' });
      sprints.set(U1, run([15, 16, 17]));
      expect(await badges.evaluateAuto(workspaceId, U1)).toEqual({ awarded: [], revoked: [] });
    });

    it('a badge created later is awarded to every existing user who already meets it', async () => {
      sprints.set(U1, run([15, 16, 17]));
      sprints.set(U2, run([15, 16, 17, 19]));
      sprints.set(U3, run([15]));
      const b = await behavioral('SPRINT_STREAK', 3);
      expect(b.awarded).toBe(2);
      expect(await awardRow(b.badgeId, U1)).not.toBeNull();
      expect(await awardRow(b.badgeId, U2)).not.toBeNull();
      expect(await awardRow(b.badgeId, U3)).toBeNull();
    });

    it('a badge a PM revoked is never given back automatically', async () => {
      const b = await behavioral('SPRINT_STREAK', 3);
      sprints.set(U1, run([15, 16, 17]));
      await badges.evaluateAuto(workspaceId, U1);
      const row = await awardRow(b.badgeId);
      await badges.revoke({ workspaceId, awardId: row?.id as string, pmId: 'PM001', reason: 'Gamed the system' });

      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([]);
      expect((await awardRow(b.badgeId))?.revokedAt).not.toBeNull();
    });

    it('rolls the award back when the notice fails', async () => {
      const b = await behavioral('SPRINT_STREAK', 1);
      sprints.set(U1, run([15]));
      notices.failNext(new Error('outbox down'));
      await expect(badges.evaluateAuto(workspaceId, U1)).rejects.toThrow('outbox down');
      expect(await awardRow(b.badgeId)).toBeNull();
    });

    it('ignores a user that does not exist', async () => {
      await behavioral('SPRINT_STREAK', 1);
      expect(await badges.evaluateAuto(workspaceId, 'BS99999')).toEqual({ awarded: [], revoked: [] });
    });
  });

  describe('kudos badge (IF-04)', () => {
    it('is awarded at the threshold, system-revoked when approved kudos drop, and re-earned later on the same row', async () => {
      const b = await behavioral('KUDOS_DISTINCT_SENDERS', 3);
      kudos.setDistinctSenders(U1, 3);
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([b.badgeId]);
      const row = await awardRow(b.badgeId);

      kudos.setDistinctSenders(U1, 2); // a kudos was reversed or rejected
      notices.userNotices.length = 0;
      expect((await badges.evaluateAuto(workspaceId, U1)).revoked).toEqual([b.badgeId]);
      expect(await awardRow(b.badgeId)).toMatchObject({ revokedById: null }); // the system, no PM
      expect((await awardRow(b.badgeId))?.revokedAt).not.toBeNull();
      expect((await awardRow(b.badgeId))?.revokeReason).toContain('Automatic');
      expect(categories()).toEqual(['Badge revoked']);

      kudos.setDistinctSenders(U1, 3);
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([b.badgeId]);
      expect((await awardRow(b.badgeId))?.id).toBe(row?.id);
      expect((await awardRow(b.badgeId))?.revokedAt).toBeNull();
    });

    it('never system-revokes a STREAK badge, even when the streak later breaks', async () => {
      const b = await behavioral('SPRINT_STREAK', 3);
      sprints.set(U1, run([15, 16, 17]));
      await badges.evaluateAuto(workspaceId, U1);
      sprints.set(U1, []);
      expect(await badges.evaluateAuto(workspaceId, U1)).toEqual({ awarded: [], revoked: [] });
      expect((await awardRow(b.badgeId))?.revokedAt).toBeNull();
    });

    it('a kudos badge a PM revoked is not re-earned automatically', async () => {
      const b = await behavioral('KUDOS_DISTINCT_SENDERS', 2);
      kudos.setDistinctSenders(U1, 2);
      await badges.evaluateAuto(workspaceId, U1);
      await badges.revoke({ workspaceId, awardId: (await awardRow(b.badgeId))?.id as string, pmId: 'PM001', reason: 'Collusion' });
      expect((await badges.evaluateAuto(workspaceId, U1)).awarded).toEqual([]);
    });
  });
});
