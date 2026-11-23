import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { BadgesService } from '../badges/badges.service.js';
import { StreakService } from '../streak/streak.service.js';
import { FakeCalendarSource } from '../testing/fake-calendar-source.js';
import { FakeKudosPort } from '../testing/fake-kudos-port.js';
import { FakeNotificationPort } from '../testing/fake-notification-port.js';
import { FakeSprintSource } from '../testing/fake-sprint-source.js';
import { createTestPrisma } from '../testing/test-db.js';
import { parseDay } from '../time/org-time.js';
import { GrowthTriggersService } from './growth-triggers.service.js';

// Needs the local database (pnpm infra:up, db:deploy, db:seed). Run: pnpm --filter api test:e2e
// Own temporary workspace and users (PM001 is the seeded PM), removed afterwards. Uses growth-core's own fakes only.
// Calendar (Dhaka weekend = Fri + Sat), Nov 2026: Sun 15, Mon 16, Tue 17, Wed 18, Thu 19. "Today" is Thu 19.
// A SPRINT_STREAK badge counts the LONGEST run, so sprints on 15, 16 and 17 earn a "3 in a row" badge.

const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const run = (days: number[]) => days.map((n) => ({ day: d(n), onTime: true }));

describe('GrowthTriggersService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const [U1, U2, UA] = [`TT1${tag}`, `TT2${tag}`, `TTA${tag}`];
  let prisma: PrismaService;
  let notices: FakeNotificationPort;
  let sprints: FakeSprintSource;
  let calendar: FakeCalendarSource;
  let kudos: FakeKudosPort;
  let badges: BadgesService;
  let streaks: StreakService;
  let triggers: GrowthTriggersService;
  let workspaceId: string;
  let seq = 0;
  const now = new Date('2026-11-19T06:00:00Z'); // Thursday 12:00 in Dhaka

  const makeUser = (userId: string, archived = false) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@trigger-test.invalid`,
        name: 'Trigger test user',
        resource: 'TRAINEE',
        pmId: 'PM001',
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        ...(archived ? { archivedAt: new Date('2026-06-01T00:00:00Z') } : {}),
      },
    });
  const streakBadge = (threshold: number) =>
    badges.create({ workspaceId, pmId: 'PM001', name: `Run ${++seq}`, icon: '🔥', kind: 'BEHAVIORAL', criteria: 'Rule', ruleType: 'SPRINT_STREAK', threshold });
  const kudosBadge = (threshold: number) =>
    badges.create({ workspaceId, pmId: 'PM001', name: `Kudos ${++seq}`, icon: '🙌', kind: 'BEHAVIORAL', criteria: 'Rule', ruleType: 'KUDOS_DISTINCT_SENDERS', threshold });
  const awardRow = (badgeId: string, userId = U1) => prisma.badgeAward.findUnique({ where: { badgeId_userId: { badgeId, userId } } });
  const streakRow = (userId = U1) => prisma.streak.findUnique({ where: { userId } });
  const newBadgeNotices = () => notices.userNotices.filter((n) => n.category === 'New badge');
  const xpEvent = (userId: string, source: 'KUDOS' | 'ON_TIME_SPRINT') =>
    prisma.xpEvent.create({
      data: { workspaceId, userId, source, amount: 5, status: 'AWARDED', key: `${source.toLowerCase()}:${randomUUID()}`, evidence: 'trigger test', occurredOn: parseDay(d(19)) },
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Triggers test', slug: `t-trig-${tag}` } })).id;
    await makeUser(U1);
    await makeUser(U2);
    await makeUser(UA, true);
  });

  beforeEach(() => {
    notices = new FakeNotificationPort();
    sprints = new FakeSprintSource();
    calendar = new FakeCalendarSource();
    kudos = new FakeKudosPort();
    const clock = { now: () => now };
    streaks = new StreakService(prisma, sprints, calendar, clock);
    badges = new BadgesService(prisma, notices, streaks, kudos, clock);
    triggers = new GrowthTriggersService(prisma, streaks, badges);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('afterSprint', () => {
    it('refreshes the saved streak and awards the badge the sprint completes, with a notice', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16, 17]));
      expect(await streakRow()).toBeNull();
      await triggers.afterSprint(workspaceId, U1);
      expect(await streakRow()).toMatchObject({ longest: 3 });
      expect(await awardRow(badge.badgeId)).toMatchObject({ source: 'AUTOMATIC', revokedAt: null, awardedById: 'PM001' });
      expect(newBadgeNotices()).toHaveLength(1);
    });

    it('is safe to repeat: the badge is awarded once and noticed once', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16, 17]));
      await triggers.afterSprint(workspaceId, U1);
      await triggers.afterSprint(workspaceId, U1);
      expect(await prisma.badgeAward.count({ where: { badgeId: badge.badgeId } })).toBe(1);
      expect(newBadgeNotices()).toHaveLength(1);
    });

    it('never throws when the re-check fails (the sprint it follows is already saved); the failure is not hidden from the logs', async () => {
      await streakBadge(3);
      sprints.set(U1, run([15, 16, 17]));
      vi.spyOn(sprints, 'submissionsOf').mockRejectedValue(new Error('sprint module down'));
      await expect(triggers.afterSprint(workspaceId, U1)).resolves.toBeUndefined();
      expect(await streakRow()).toBeNull();
    });
  });

  describe('afterStreakChange', () => {
    it('awards the badge a freeze completes (Sun, Mon, [Tue frozen], Wed = 3 counted days)', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16, 18]));
      await triggers.afterStreakChange(workspaceId, U1);
      expect(await awardRow(badge.badgeId)).toBeNull(); // Tuesday is a missed day: the run restarted
      calendar.setFrozenDays(U1, [d(17)]);
      await triggers.afterStreakChange(workspaceId, U1);
      expect(await awardRow(badge.badgeId)).toMatchObject({ source: 'AUTOMATIC', revokedAt: null });
    });

    it('awards nothing while the rule is not met', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16]));
      await triggers.afterStreakChange(workspaceId, U1);
      expect(await awardRow(badge.badgeId)).toBeNull();
      expect(newBadgeNotices()).toHaveLength(0);
    });

    it('never throws when the badge check fails, and the failed check leaves no half-made award', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16, 17]));
      notices.failNext(new Error('notice layer down'));
      await expect(triggers.afterStreakChange(workspaceId, U1)).resolves.toBeUndefined();
      expect(await awardRow(badge.badgeId)).toBeNull(); // the award and its notice are one change: both undone
      await triggers.afterStreakChange(workspaceId, U1); // once the notice layer is back, the same call awards it
      expect(await awardRow(badge.badgeId)).not.toBeNull();
    });
  });

  describe('afterXpDecision', () => {
    it('a decided KUDOS event re-checks its receiver: the kudos badge is awarded', async () => {
      const badge = await kudosBadge(2);
      kudos.setDistinctSenders(U1, 2);
      const event = await xpEvent(U1, 'KUDOS');
      await triggers.afterXpDecision(workspaceId, event.id);
      expect(await awardRow(badge.badgeId)).toMatchObject({ source: 'AUTOMATIC', revokedAt: null });
    });

    it('any other kind of event re-checks nobody', async () => {
      await kudosBadge(2);
      kudos.setDistinctSenders(U1, 2);
      const spy = vi.spyOn(badges, 'evaluateAuto');
      const event = await xpEvent(U1, 'ON_TIME_SPRINT');
      await triggers.afterXpDecision(workspaceId, event.id);
      expect(spy).not.toHaveBeenCalled();
    });

    it('an unknown event, or one looked up in the wrong workspace, does nothing and does not throw', async () => {
      await kudosBadge(2);
      kudos.setDistinctSenders(U1, 2);
      const spy = vi.spyOn(badges, 'evaluateAuto');
      const event = await xpEvent(U1, 'KUDOS');
      await expect(triggers.afterXpDecision(workspaceId, randomUUID())).resolves.toBeUndefined();
      await expect(triggers.afterXpDecision(randomUUID(), event.id)).resolves.toBeUndefined();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('nightly', () => {
    it('refreshes every ACTIVE person\'s streak and badges, skips archived people, and counts what it did', async () => {
      const badge = await streakBadge(3);
      sprints.set(U1, run([15, 16, 17]));
      sprints.set(UA, run([15, 16, 17])); // archived: must be left alone
      const result = await triggers.nightly(now, workspaceId);
      expect(result).toEqual({ streaksHandled: 2, streaksFailed: 0, badgesChecked: 2, badgesFailed: 0, awarded: 1, revoked: 0 });
      expect(await streakRow(U1)).toMatchObject({ longest: 3 });
      expect(await streakRow(UA)).toBeNull();
      expect(await awardRow(badge.badgeId, U1)).not.toBeNull();
      expect(await awardRow(badge.badgeId, UA)).toBeNull();
    });

    it('a second run changes nothing, and a badge that is no longer earned is taken back (kudos badge)', async () => {
      await streakBadge(3);
      const kudosB = await kudosBadge(2);
      sprints.set(U1, run([15, 16, 17]));
      kudos.setDistinctSenders(U1, 2);
      const first = await triggers.nightly(now, workspaceId);
      expect(first.awarded).toBe(2);
      const second = await triggers.nightly(now, workspaceId);
      expect(second).toMatchObject({ awarded: 0, revoked: 0 });
      kudos.setDistinctSenders(U1, 1); // an approved kudos was reversed
      const third = await triggers.nightly(now, workspaceId);
      expect(third).toMatchObject({ awarded: 0, revoked: 1 });
      expect((await awardRow(kudosB.badgeId))?.revokedAt).not.toBeNull();
    });

    it('one person failing does not stop the others, and the failure is counted', async () => {
      const badge = await streakBadge(3);
      sprints.set(U2, run([15, 16, 17]));
      const original = badges.evaluateAuto.bind(badges);
      vi.spyOn(badges, 'evaluateAuto').mockImplementation(async (ws, userId, options) => {
        if (userId === U1) throw new Error('U1 cannot be checked');
        return original(ws, userId, options);
      });
      const result = await triggers.nightly(now, workspaceId);
      expect(result).toMatchObject({ badgesFailed: 1, badgesChecked: 1, awarded: 1 });
      expect(await awardRow(badge.badgeId, U2)).not.toBeNull(); // checked despite U1's failure
    });
  });
});
