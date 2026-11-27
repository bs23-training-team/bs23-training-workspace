import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FakeCalendarSource } from '../testing/fake-calendar-source.js';
import { FakeKudosPort } from '../testing/fake-kudos-port.js';
import { FakeNotificationPort } from '../testing/fake-notification-port.js';
import { FakeSprintSource } from '../testing/fake-sprint-source.js';
import { createTestPrisma } from '../testing/test-db.js';
import { StreakService } from '../streak/streak.service.js';
import { parseDay } from '../time/org-time.js';
import { BadgesQueryService } from './badges-query.service.js';
import { BadgesService } from './badges.service.js';

// Reading the badge catalogue (GET /badges): a user's view (own award, progress) and a PM's view (who holds what).
// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace and users, removed afterwards. "Today" is Thu 19 Nov 2026 (Dhaka weekend = Fri + Sat).
// U1 and U2 belong to PM001, U3 to PM002, U4 is archived.

const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const days = (...ns: number[]) => ns.map((n) => ({ day: d(n), onTime: true }));

describe('BadgesQueryService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const [U1, U2, U3, U4] = [`TQ1${tag}`, `TQ2${tag}`, `TQ3${tag}`, `TQ4${tag}`];
  let prisma: PrismaService;
  let sprints: FakeSprintSource;
  let kudos: FakeKudosPort;
  let badges: BadgesService;
  let reader: BadgesQueryService;
  let workspaceId: string;
  let seq = 0;

  const user = (userId: string, pmId: string, archived = false) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@badge-read-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        ...(archived ? { archivedAt: new Date('2026-11-10T00:00:00Z') } : {}),
      },
    });
  const special = () =>
    badges.create({ workspaceId, pmId: 'PM001', name: `Special ${++seq}`, icon: '🏅', kind: 'SPECIAL', criteria: 'Helped the team' });
  const behavioral = (ruleType: 'SPRINT_STREAK' | 'KUDOS_DISTINCT_SENDERS', threshold: number) =>
    badges.create({ workspaceId, pmId: 'PM001', name: `Auto ${++seq}`, icon: '🔥', kind: 'BEHAVIORAL', criteria: 'Rule', ruleType, threshold });
  const award = (badgeId: string, userId: string, pmId = 'PM001') =>
    badges.awardSpecial({ workspaceId, badgeId, userId, pmId, evidence: 'Led the demo' });
  const userBadge = async (userId: string, badgeId: string) =>
    (await reader.forUser(workspaceId, userId)).badges.find((b) => b.badgeId === badgeId);
  const pmBadge = async (badgeId: string) => (await reader.forPm(workspaceId, 'PM001')).badges.find((b) => b.badgeId === badgeId);

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Badge read test', slug: `t-badge-read-${tag}` } })).id;
    await user(U1, 'PM001');
    await user(U2, 'PM001');
    await user(U3, 'PM002');
    await user(U4, 'PM001', true);
  });

  beforeEach(() => {
    sprints = new FakeSprintSource();
    kudos = new FakeKudosPort();
    const clock = { now: () => new Date('2026-11-19T06:00:00Z') };
    const streaks = new StreakService(prisma, sprints, new FakeCalendarSource(), clock);
    badges = new BadgesService(prisma, new FakeNotificationPort(), streaks, kudos, clock);
    reader = new BadgesQueryService(prisma, streaks, kudos, clock);
  });

  afterEach(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('a user', () => {
    it('sees each badge with the rule and the progress toward it, in the unit of the rule', async () => {
      sprints.set(U1, days(16, 17, 18, 19)); // a streak of 4 working days
      kudos.setDistinctSenders(U1, 2);
      const s = await special();
      const streak = await behavioral('SPRINT_STREAK', 5);
      const kudosBadge = await behavioral('KUDOS_DISTINCT_SENDERS', 3);

      const page = await reader.forUser(workspaceId, U1);
      expect(page.viewer).toBe('USER');
      expect(page.badges.map((b) => b.badgeId)).toEqual([s.badgeId, streak.badgeId, kudosBadge.badgeId]); // oldest first
      expect(page.badges[0]).toMatchObject({ kind: 'SPECIAL', rule: null, progress: null, mine: null, retiredAt: null });
      expect(page.badges[1]).toMatchObject({ kind: 'BEHAVIORAL', rule: { type: 'SPRINT_STREAK', threshold: 5 }, progress: { value: 4, threshold: 5 } });
      expect(page.badges[2]).toMatchObject({ rule: { type: 'KUDOS_DISTINCT_SENDERS', threshold: 3 }, progress: { value: 2, threshold: 3 } });
    });

    it('sees their own award, and no progress for a badge they hold', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId, U1);
      expect(await userBadge(U1, s.badgeId)).toMatchObject({
        mine: { awardId, source: 'MANUAL', revokedAt: null },
        progress: null,
      });
      expect((await userBadge(U2, s.badgeId))?.mine).toBeNull(); // another user's award is not theirs
    });

    it('shows a revoked award as revoked, with no reason', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId, U1);
      await badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: 'Not earned after all' });
      const view = await userBadge(U1, s.badgeId);
      expect(view?.mine?.revokedAt).not.toBeNull();
      expect(JSON.stringify(view)).not.toContain('Not earned after all');
    });

    it('does not list a retired badge, unless the user holds it', async () => {
      const kept = await special();
      const gone = await special();
      await award(kept.badgeId, U1);
      await badges.retire({ workspaceId, badgeId: kept.badgeId, pmId: 'PM001' });
      await badges.retire({ workspaceId, badgeId: gone.badgeId, pmId: 'PM001' });

      const ids = (await reader.forUser(workspaceId, U1)).badges.map((b) => b.badgeId);
      expect(ids).toEqual([kept.badgeId]);
      expect((await userBadge(U1, kept.badgeId))?.retiredAt).not.toBeNull();
      expect((await reader.forUser(workspaceId, U2)).badges).toEqual([]);
    });
  });

  describe('a PM', () => {
    it('sees every badge, retired ones too, with who holds it', async () => {
      const s = await special();
      const gone = await special();
      await award(s.badgeId, U1);
      await badges.retire({ workspaceId, badgeId: gone.badgeId, pmId: 'PM001' });

      const page = await reader.forPm(workspaceId, 'PM001');
      expect(page.viewer).toBe('PM');
      expect(page.badges.map((b) => b.badgeId)).toEqual([s.badgeId, gone.badgeId]);
      expect(page.badges[0]?.awards).toMatchObject([{ userId: U1, userName: `Name ${U1}`, managedByYou: true, source: 'MANUAL', awardedBy: 'PM001', revokedAt: null }]);
      expect(page.badges[1]?.retiredAt).not.toBeNull();
    });

    it('shows an automatic award as "System": no awarding PM', async () => {
      sprints.set(U1, days(16, 17, 18, 19));
      const auto = await behavioral('SPRINT_STREAK', 3); // U1 already meets it, so it is awarded when the badge is created
      const award = (await pmBadge(auto.badgeId))?.awards[0];
      expect(award).toMatchObject({ userId: U1, source: 'AUTOMATIC', awardedBy: null });
      // the row itself still stores the creating PM (the column is required): only the view hides it
      expect((await prisma.badgeAward.findFirstOrThrow({ where: { badgeId: auto.badgeId } })).awardedById).toBe('PM001');
    });

    it('shows a revoke with its reason', async () => {
      const s = await special();
      const { awardId } = await award(s.badgeId, U1);
      await badges.revoke({ workspaceId, awardId, pmId: 'PM001', reason: 'Not earned after all' });
      expect((await pmBadge(s.badgeId))?.awards[0]).toMatchObject({ revokedAt: expect.any(String) as string, revokeReason: 'Not earned after all' });
    });

    it('sees awards of the users the directory shows (every active user), not archived users', async () => {
      const s = await special();
      await award(s.badgeId, U3, 'PM002'); // another PM's user
      await prisma.badgeAward.create({
        data: { workspaceId, badgeId: s.badgeId, userId: U4, source: 'MANUAL', evidence: 'x', awardedById: 'PM001' },
      });
      const holders = (await pmBadge(s.badgeId))?.awards.map((a) => [a.userId, a.managedByYou]);
      expect(holders).toEqual([[U3, false]]);
      // the same award, read by the user's own PM
      const own = (await reader.forPm(workspaceId, 'PM002')).badges.find((b) => b.badgeId === s.badgeId);
      expect(own?.awards.map((a) => [a.userId, a.managedByYou])).toEqual([[U3, true]]);
    });
  });

  describe('paging', () => {
    it('pages the catalogue with a cursor', async () => {
      const [a, b, c] = [await special(), await special(), await special()];
      const first = await reader.forUser(workspaceId, U1, { limit: 2 });
      expect(first.badges.map((x) => x.badgeId)).toEqual([a.badgeId, b.badgeId]);
      expect(first.nextCursor).toBe('2');
      const second = await reader.forUser(workspaceId, U1, { limit: 2, cursor: first.nextCursor });
      expect(second.badges.map((x) => x.badgeId)).toEqual([c.badgeId]);
      expect(second.nextCursor).toBeNull();
      expect((await reader.forPm(workspaceId, 'PM001', { limit: 2 })).nextCursor).toBe('2');
    });
  });
});
