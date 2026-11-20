import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FakeCalendarSource } from '../testing/fake-calendar-source.js';
import { FakeSprintSource } from '../testing/fake-sprint-source.js';
import { createTestPrisma } from '../testing/test-db.js';
import { parseDay } from '../time/org-time.js';
import { StreakService } from './streak.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace and users (never the seeded ones): the nightly refresh touches every
// active user of the workspace it is given. Calendar used (Dhaka weekend = Fri + Sat):
//   Sun 15  Mon 16  Tue 17  Wed 18  Thu 19  Fri 20  Sat 21  Sun 22  Mon 23  (Nov 2026)

const d = (n: string) => `2026-11-${n}`;
const sub = (n: string, onTime = true) => ({ day: d(n), onTime });

describe('StreakService (database)', () => {
  const tag = randomUUID().slice(0, 8);
  const USER = `TSTR${tag}`;
  const OTHER = `TSTO${tag}`;
  let prisma: PrismaService;
  let sprints: FakeSprintSource;
  let calendar: FakeCalendarSource;
  let streaks: StreakService;
  let workspaceId: string;
  let now = new Date('2026-11-19T06:00:00Z'); // Thu 19, noon in Dhaka

  const row = () => prisma.streak.findUnique({ where: { userId: USER } });
  const makeUser = (userId: string, pmId: string) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@streak-test.invalid`,
        name: 'Streak test user',
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
      },
    });
  const freeze = (date: string, reason = 'Approved leave', pmId = 'PM001', userId = USER) =>
    streaks.grantFreeze({ workspaceId, pmId, userId, date, source: 'LEAVE', reason });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Streak test', slug: `t-streak-${tag}` } })).id;
    await makeUser(USER, 'PM001');
    await makeUser(OTHER, 'PM001');
  });

  beforeEach(() => {
    sprints = new FakeSprintSource();
    calendar = new FakeCalendarSource();
    now = new Date('2026-11-19T06:00:00Z');
    streaks = new StreakService(prisma, sprints, calendar, { now: () => now });
  });

  afterEach(async () => {
    await prisma.streakFreeze.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.streakFreeze.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('recalc (the cache row)', () => {
    it('saves current, longest and the last submission date', async () => {
      sprints.set(USER, [sub('15'), sub('16'), sub('18'), sub('19')]); // Tue 17 missed
      const result = await streaks.recalc(workspaceId, USER);
      expect(result).toMatchObject({ current: 2, longest: 2, lastSubmissionDate: d('19') });
      const saved = await row();
      expect(saved).toMatchObject({ current: 2, longest: 2 });
      expect(saved?.lastSubmissionDate?.toISOString().slice(0, 10)).toBe(d('19'));
    });

    it('is a cache: recalculating again changes nothing and keeps one row', async () => {
      sprints.set(USER, [sub('18'), sub('19')]);
      await streaks.recalc(workspaceId, USER);
      const first = await row();
      await streaks.recalc(workspaceId, USER);
      expect(await prisma.streak.count({ where: { userId: USER } })).toBe(1);
      expect(await row()).toMatchObject({ current: first?.current, longest: first?.longest });
    });

    it('keeps one row when 6 recalculations run at once', async () => {
      sprints.set(USER, [sub('18'), sub('19')]);
      await Promise.all(Array.from({ length: 6 }, () => streaks.recalc(workspaceId, USER)));
      expect(await prisma.streak.count({ where: { userId: USER } })).toBe(1);
      expect(await row()).toMatchObject({ current: 2 });
    });

    it('lets leave and holidays from the calendar keep the streak, but not pending leave (not in the set)', async () => {
      sprints.set(USER, [sub('16'), sub('18'), sub('19')]);
      expect((await streaks.recalc(workspaceId, USER)).current).toBe(2); // Tue 17 missed, nothing frozen
      calendar.setFrozenDays(USER, [d('17')]); // approved leave
      expect((await streaks.recalc(workspaceId, USER)).current).toBe(3);
    });

    it('creates no XP, even for a run of 10 working days', async () => {
      const days = ['15', '16', '17', '18', '19', '22', '23', '24', '25', '26'];
      sprints.set(USER, days.map((n) => sub(n)));
      const result = await streaks.recalc(workspaceId, USER, d('26'));
      expect(result.current).toBe(10);
      expect(await prisma.xpEvent.count({ where: { userId: USER } })).toBe(0);
    });
  });

  describe('nightly refresh', () => {
    it('drops the streak after a missed day without any new submission, and a second run changes nothing', async () => {
      sprints.set(USER, [sub('16'), sub('17'), sub('18')]);
      now = new Date('2026-11-18T10:00:00Z'); // Wed 18 evening
      await streaks.runStreakRefresh(now, workspaceId);
      expect((await row())?.current).toBe(3);

      now = new Date('2026-11-20T00:30:00Z'); // Fri 20 morning, Thu 19 was missed
      const first = await streaks.runStreakRefresh(now, workspaceId);
      expect(first).toEqual({ handled: 2, failed: 0 }); // USER and OTHER
      expect((await row())?.current).toBe(0);
      expect((await row())?.longest).toBe(3);

      const before = await row();
      await streaks.runStreakRefresh(now, workspaceId);
      expect(await row()).toMatchObject({ current: before?.current, longest: before?.longest });
    });

    it('counts a failing user and carries on with the others', async () => {
      const failing = { submissionsOf: async (_db: unknown, userId: string) => {
        if (userId === USER) throw new Error('boom');
        return [];
      } };
      const service = new StreakService(prisma, failing as never, calendar, { now: () => now });
      expect(await service.runStreakRefresh(now, workspaceId)).toEqual({ handled: 1, failed: 1 });
    });
  });

  describe('grantFreeze', () => {
    it('freezes a day, recalculates the streak, and the reason is private', async () => {
      sprints.set(USER, [sub('16'), sub('18'), sub('19')]);
      await streaks.recalc(workspaceId, USER);
      expect((await row())?.current).toBe(2);

      await freeze(d('17'), 'Sick leave, certificate seen');

      expect((await row())?.current).toBe(3); // Tue 17 no longer breaks it
      expect(await streaks.listOwnFreezes(USER)).toEqual([{ date: d('17'), source: 'LEAVE' }]); // no reason
      const forPm = await streaks.listFreezesForPm(workspaceId, 'PM001', USER);
      expect(forPm).toMatchObject([{ date: d('17'), reason: 'Sick leave, certificate seen', grantedById: 'PM001' }]);
    });

    it('refuses a second freeze for the same user and date (ALREADY_FROZEN)', async () => {
      await freeze(d('17'));
      await expect(freeze(d('17'), 'Again')).rejects.toMatchObject({ code: 'ALREADY_FROZEN' });
      expect(await prisma.streakFreeze.count({ where: { userId: USER } })).toBe(1);
    });

    it('lets exactly one of 6 simultaneous freezes for one date win', async () => {
      const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => freeze(d('17'))));
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
      for (const a of attempts.filter((x) => x.status === 'rejected')) {
        expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'ALREADY_FROZEN' });
      }
    });

    it("refuses another PM's user (FORBIDDEN_SCOPE), for granting and for reading reasons", async () => {
      await expect(freeze(d('17'), 'x', 'PM002')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(streaks.listFreezesForPm(workspaceId, 'PM002', USER)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(streaks.listFreezesForPm(workspaceId, 'PM001', 'BS99999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.streakFreeze.count({ where: { userId: USER } })).toBe(0);
    });

    it('validates: a reason, a real date, a known source, an existing user', async () => {
      await expect(freeze(d('17'), '   ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
      await expect(freeze('2026-02-30')).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(freeze('tomorrow')).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(
        streaks.grantFreeze({ workspaceId, pmId: 'PM001', userId: USER, date: d('17'), source: 'NOPE' as never, reason: 'x' }),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(freeze(d('17'), 'x', 'PM001', 'BS99999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.streakFreeze.count({ where: { workspaceId } })).toBe(0);
    });

    it('rolls the freeze back if the streak recalculation fails', async () => {
      const failing = { submissionsOf: async () => { throw new Error('sprint source down'); } };
      const service = new StreakService(prisma, failing as never, calendar, { now: () => now });
      await expect(
        service.grantFreeze({ workspaceId, pmId: 'PM001', userId: USER, date: d('17'), source: 'LEAVE', reason: 'x' }),
      ).rejects.toThrow('sprint source down');
      expect(await prisma.streakFreeze.count({ where: { userId: USER } })).toBe(0);
    });
  });
});
