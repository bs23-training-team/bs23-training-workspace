import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { LevelsService } from '../../growth-core/levels/levels.service.js';
import { FakeNotificationPort } from '../../growth-core/testing/fake-notification-port.js';
import { createTestPrisma } from '../../growth-core/testing/test-db.js';
import { parseDay } from '../../growth-core/time/org-time.js';
import { XpLedgerService } from '../../growth-core/xp/xp-ledger.service.js';
import { QuestsService } from './quests.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace with its own levels (Rookie 0, Builder 50), users and quests; removed
// afterwards. U1..U3 belong to PM001, X1 to PM002, ARCH is archived. "Today" is Wed 2026-11-18.

describe('QuestsService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const id = (n: string) => `TQ${n}${tag}`;
  const [U1, U2, U3, X1, ARCH] = ['U1', 'U2', 'U3', 'X1', 'AR'].map(id) as [string, string, string, string, string];

  let prisma: PrismaService;
  let notices: FakeNotificationPort;
  let ledger: XpLedgerService;
  let quests: QuestsService;
  let workspaceId: string;

  const newQuest = (over: Partial<Parameters<QuestsService['create']>[0]> = {}) =>
    quests.create({
      workspaceId,
      pmId: 'PM001',
      name: `Send 5 kudos ${randomUUID().slice(0, 4)}`,
      description: 'Recognise teammates',
      target: 5,
      reward: 20,
      startDate: '2026-11-16',
      endDate: '2026-11-22',
      ...over,
    });
  const progress = (questId: string, userId: string, count: number, pmId = 'PM001') =>
    quests.setProgress({ workspaceId, questId, userId, pmId, count });
  const verify = (questId: string, userId: string, pmId = 'PM001') => quests.verify({ workspaceId, questId, userId, pmId });
  const eventsOf = (userId: string) => prisma.xpEvent.findMany({ where: { workspaceId, userId, source: 'QUEST' } });
  const makeUser = (userId: string, pmId: string, archivedAt: Date | null = null) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@quest-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        archivedAt,
      },
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Quest test', slug: `t-quest-${tag}` } })).id;
    for (const u of [U1, U2, U3]) await makeUser(u, 'PM001');
    await makeUser(X1, 'PM002');
    await makeUser(ARCH, 'PM001', new Date('2026-06-01T00:00:00Z'));
  });

  beforeEach(async () => {
    notices = new FakeNotificationPort();
    ledger = new XpLedgerService(prisma);
    const levels = new LevelsService(prisma, notices);
    await levels.save(workspaceId, [{ name: 'Rookie', minXp: 0 }, { name: 'Builder', minXp: 50 }]);
    quests = new QuestsService(prisma, ledger, levels, { now: () => new Date('2026-11-18T06:00:00Z') });
  });

  afterEach(async () => {
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.questProgress.deleteMany({ where: { workspaceId } });
    await prisma.quest.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.questProgress.deleteMany({ where: { workspaceId } });
    await prisma.quest.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('saves a quest with its dates, target and reward', async () => {
      const { questId } = await newQuest({ name: ' Weekly quest ', target: 3, reward: 15 });
      const row = await prisma.quest.findUniqueOrThrow({ where: { id: questId } });
      expect(row).toMatchObject({ name: 'Weekly quest', target: 3, reward: 15, createdById: 'PM001' });
      expect(row.startDate.toISOString().slice(0, 10)).toBe('2026-11-16');
    });

    it('refuses bad input before the database (TARGET, REWARD, DATES) and saves nothing', async () => {
      await expect(newQuest({ target: 0 })).rejects.toMatchObject({ code: 'TARGET' });
      await expect(newQuest({ reward: -1 })).rejects.toMatchObject({ code: 'REWARD' });
      await expect(newQuest({ startDate: '2026-11-20', endDate: '2026-11-19' })).rejects.toMatchObject({ code: 'DATES' });
      expect(await prisma.quest.count({ where: { workspaceId } })).toBe(0);
    });

    it('the database itself refuses a target below 1 and an end date before the start', async () => {
      const data = { workspaceId, name: 'x', description: 'x', reward: 1, createdById: 'PM001' };
      await expect(
        prisma.quest.create({ data: { ...data, target: 0, startDate: parseDay('2026-11-16'), endDate: parseDay('2026-11-17') } }),
      ).rejects.toThrow();
      await expect(
        prisma.quest.create({ data: { ...data, target: 1, startDate: parseDay('2026-11-17'), endDate: parseDay('2026-11-16') } }),
      ).rejects.toThrow();
    });
  });

  describe('setProgress', () => {
    it('keeps ONE row per quest and user, replacing the count', async () => {
      const { questId } = await newQuest();
      await progress(questId, U1, 2);
      await progress(questId, U1, 4);
      expect(await prisma.questProgress.count({ where: { questId, userId: U1 } })).toBe(1);
      expect((await prisma.questProgress.findFirstOrThrow({ where: { questId, userId: U1 } })).count).toBe(4);
    });

    it('refuses a bad count, another PM\'s user, an archived user, and an unknown quest or user', async () => {
      const { questId } = await newQuest();
      await expect(progress(questId, U1, -1)).rejects.toMatchObject({ code: 'COUNT' });
      await expect(progress(questId, U1, 1.5)).rejects.toMatchObject({ code: 'COUNT' });
      await expect(progress(questId, X1, 1)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(progress(questId, ARCH, 1)).rejects.toMatchObject({ code: 'USER_ARCHIVED' });
      await expect(progress(questId, 'BS99999', 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(progress(randomUUID(), U1, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await prisma.questProgress.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('verify', () => {
    it('pays nothing below the target, and marks nothing', async () => {
      const { questId } = await newQuest({ target: 5 });
      await progress(questId, U1, 4);
      expect(await verify(questId, U1)).toEqual({ paid: false, reason: 'BELOW_TARGET', count: 4, target: 5 });
      expect(await eventsOf(U1)).toHaveLength(0);
      expect((await prisma.questProgress.findFirstOrThrow({ where: { questId, userId: U1 } })).verifiedAt).toBeNull();
    });

    it('at the target pays ONE event, already AWARDED, with the reward, key, today, and no review row', async () => {
      const { questId } = await newQuest({ target: 5, reward: 20 });
      await progress(questId, U1, 5);
      const result = await verify(questId, U1);

      expect(result).toMatchObject({ paid: true, amount: 20 });
      const events = await eventsOf(U1);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        status: 'AWARDED',
        amount: 20,
        key: `quest:${questId}:${U1}`,
        questId,
        userId: U1,
      });
      expect(events[0]?.occurredOn.toISOString().slice(0, 10)).toBe('2026-11-18'); // the server's day
      expect(await prisma.xpReview.count({ where: { xpEventId: events[0]?.id } })).toBe(0);
      expect(await ledger.awardedTotal(U1)).toBe(20);
      const row = await prisma.questProgress.findFirstOrThrow({ where: { questId, userId: U1 } });
      expect(row).toMatchObject({ verifiedById: 'PM001' });
      expect(row.verifiedAt).not.toBeNull();
    });

    it('pays when the count is above the target too', async () => {
      const { questId } = await newQuest({ target: 5, reward: 7 });
      await progress(questId, U1, 9);
      expect(await verify(questId, U1)).toMatchObject({ paid: true, amount: 7 });
    });

    it('pays nothing the second time, and nothing after the reward is edited', async () => {
      const { questId } = await newQuest({ target: 1, reward: 20 });
      await progress(questId, U1, 1);
      await verify(questId, U1);
      expect(await verify(questId, U1)).toEqual({ paid: false, reason: 'ALREADY_PAID' });
      await prisma.quest.update({ where: { id: questId }, data: { reward: 999 } });
      expect(await verify(questId, U1)).toEqual({ paid: false, reason: 'ALREADY_PAID' });
      expect(await eventsOf(U1)).toHaveLength(1);
      expect(await ledger.awardedTotal(U1)).toBe(20);
    });

    it('uses the reward AS IT IS when verified (an edit before verifying counts)', async () => {
      const { questId } = await newQuest({ target: 1, reward: 20 });
      await progress(questId, U1, 1);
      await prisma.quest.update({ where: { id: questId }, data: { reward: 35 } });
      expect(await verify(questId, U1)).toMatchObject({ paid: true, amount: 35 });
    });

    it('pays exactly once when 6 verifications arrive at once', async () => {
      const { questId } = await newQuest({ target: 1, reward: 20 });
      await progress(questId, U1, 1);
      const results = await Promise.all(Array.from({ length: 6 }, () => verify(questId, U1)));
      expect(results.filter((r) => r.paid)).toHaveLength(1);
      expect(await eventsOf(U1)).toHaveLength(1);
      expect(await ledger.awardedTotal(U1)).toBe(20);
    });

    it('refuses a user with no recorded progress (NO_PROGRESS), another PM\'s user (FORBIDDEN_SCOPE), unknown ids', async () => {
      const { questId } = await newQuest();
      await expect(verify(questId, U1)).rejects.toMatchObject({ code: 'NO_PROGRESS' });
      await progress(questId, U1, 5);
      await expect(verify(questId, U1, 'PM002')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
      await expect(verify(randomUUID(), U1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await eventsOf(U1)).toHaveLength(0);
    });

    it('a reward of 0 still records the verification, with a 0 XP event', async () => {
      const { questId } = await newQuest({ target: 1, reward: 0 });
      await progress(questId, U1, 1);
      expect(await verify(questId, U1)).toMatchObject({ paid: true, amount: 0 });
      expect(await ledger.awardedTotal(U1)).toBe(0);
    });

    it('pays each user of the same quest separately', async () => {
      const { questId } = await newQuest({ target: 1, reward: 10 });
      await progress(questId, U1, 1);
      await progress(questId, U2, 1);
      await verify(questId, U1);
      await verify(questId, U2);
      expect(await eventsOf(U1)).toHaveLength(1);
      expect(await eventsOf(U2)).toHaveLength(1);
    });
  });

  describe('level-up notice (IF-02)', () => {
    it('is created in the same verification when the reward crosses a level threshold, once', async () => {
      const { questId } = await newQuest({ target: 1, reward: 60 });
      await progress(questId, U1, 1);
      await verify(questId, U1);
      expect(notices.userNotices.map((n) => n.category)).toEqual(['Level up']);
      expect(notices.userNotices[0]).toMatchObject({ userId: U1 });
      expect(notices.userNotices[0]?.message).toContain('Builder');
      await verify(questId, U1); // pays nothing, no second notice
      expect(notices.userNotices).toHaveLength(1);
    });

    it('is created ONCE when two quests of one user are verified at the same moment (the user lock orders them)', async () => {
      await ledger.createEvent({
        workspaceId,
        userId: U1,
        source: 'MANUAL_ADJUSTMENT',
        amount: 40,
        key: `manual:${randomUUID()}`,
        evidence: 'starting XP',
        occurredOn: parseDay('2026-11-01'),
      }); // 40 XP: 10 short of Builder
      const a = (await newQuest({ target: 1, reward: 20 })).questId;
      const b = (await newQuest({ target: 1, reward: 20 })).questId;
      await progress(a, U1, 1);
      await progress(b, U1, 1);

      await Promise.all([verify(a, U1), verify(b, U1)]);

      expect(await ledger.awardedTotal(U1)).toBe(80);
      // 40 -> 60 crosses Builder (50); 60 -> 80 stays inside it. Without the lock both would see 40 and both notify.
      expect(notices.userNotices.filter((n) => n.category === 'Level up')).toHaveLength(1);
    });

    it('is not created when the reward stays inside a level', async () => {
      const { questId } = await newQuest({ target: 1, reward: 20 });
      await progress(questId, U1, 1);
      await verify(questId, U1);
      expect(notices.userNotices).toHaveLength(0);
    });

    it('rolls the XP and the verification back when the notice fails', async () => {
      const { questId } = await newQuest({ target: 1, reward: 60 });
      await progress(questId, U1, 1);
      notices.failNext(new Error('outbox down'));
      await expect(verify(questId, U1)).rejects.toThrow('outbox down');
      expect(await eventsOf(U1)).toHaveLength(0);
      expect((await prisma.questProgress.findFirstOrThrow({ where: { questId, userId: U1 } })).verifiedAt).toBeNull();
    });
  });

  describe('reading', () => {
    it('lists the workspace\'s quests newest first, with paging', async () => {
      await newQuest({ name: 'Old', startDate: '2026-10-01', endDate: '2026-10-07' });
      await newQuest({ name: 'Mid', startDate: '2026-11-01', endDate: '2026-11-07' });
      await newQuest({ name: 'New', startDate: '2026-11-16', endDate: '2026-11-22' });
      const first = await quests.list(workspaceId, { limit: 2 });
      expect(first.quests.map((q) => q.name)).toEqual(['New', 'Mid']);
      expect(first.nextCursor).toBe('2');
      const second = await quests.list(workspaceId, { limit: 2, cursor: first.nextCursor });
      expect(second.quests.map((q) => q.name)).toEqual(['Old']);
      expect(second.nextCursor).toBeNull();
      await expect(quests.list(workspaceId, { cursor: 'x' })).rejects.toMatchObject({ code: 'VALIDATION' });
    });

    it('a user sees only their own progress', async () => {
      const { questId } = await newQuest();
      await progress(questId, U1, 1);
      await progress(questId, U2, 2);
      await quests.setProgress({ workspaceId, questId, userId: X1, pmId: 'PM002', count: 3 });

      const mine = await quests.progressForUser(workspaceId, U1);
      expect(mine.map((p) => p.userId)).toEqual([U1]);
      expect(Object.keys(mine[0]!).sort()).toEqual(['count', 'questId', 'userId', 'verifiedAt']); // no managedByYou
    });

    it('a PM reads the progress of every active user, and managedByYou says whose it is to verify', async () => {
      const { questId } = await newQuest();
      await progress(questId, U1, 1);
      await progress(questId, U2, 2);
      await quests.setProgress({ workspaceId, questId, userId: X1, pmId: 'PM002', count: 3 }); // PM002's user

      const flags = async (pmId: string) =>
        (await quests.progressForPm(workspaceId, pmId)).map((p) => [p.userId, p.managedByYou] as const).sort();
      expect(await flags('PM001')).toEqual([[U1, true], [U2, true], [X1, false]].sort());
      expect(await flags('PM002')).toEqual([[U1, false], [U2, false], [X1, true]].sort());
    });

    it('an archived user is read only by their own PM', async () => {
      const { questId } = await newQuest();
      await progress(questId, U1, 1);
      // Written directly: recording progress for an archived user is refused, but it can exist from before the archive.
      await prisma.questProgress.create({ data: { workspaceId, questId, userId: ARCH, count: 2 } });

      expect((await quests.progressForPm(workspaceId, 'PM001')).map((p) => p.userId)).toContain(ARCH); // ARCH is PM001's
      expect((await quests.progressForPm(workspaceId, 'PM002')).map((p) => p.userId)).not.toContain(ARCH);
    });

    it('a PM can narrow progress to one quest, and a verified row shows when it was verified', async () => {
      const first = (await newQuest({ target: 1 })).questId;
      const second = (await newQuest({ target: 1 })).questId;
      await progress(first, U1, 1);
      await progress(second, U1, 1);
      await verify(first, U1);

      const onlyFirst = await quests.progressForPm(workspaceId, 'PM001', first);
      expect(onlyFirst).toHaveLength(1);
      expect(onlyFirst[0]).toMatchObject({ questId: first, userId: U1 });
      expect(onlyFirst[0]?.verifiedAt).toEqual(expect.any(String)); // verified
      const unverified = (await quests.progressForPm(workspaceId, 'PM001', second))[0];
      expect(unverified?.verifiedAt).toBeNull();
    });
  });
});
