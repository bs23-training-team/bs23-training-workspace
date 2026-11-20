import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { XpLedgerService, XpRulesService } from '../../growth-core/index.js';
import { createTestPrisma } from '../../growth-core/testing/test-db.js';
import { parseDay } from '../../growth-core/time/org-time.js';
import { FakeEngagementNotifications } from '../testing/fake-engagement-notifications.js';
import { KudosQueryService } from './kudos-query.service.js';
import { KudosService, type SendKudosInput } from './kudos.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace (its own XpRule row), users and kudos, removed afterwards.
// Calendar (weeks start on Monday): Sun 15, Mon 16 ... Sun 22, Mon 23, Mon 30 (Nov 2026).
// Rules in the temporary workspace are the defaults: 5 XP, 3 sends a week, 7 days cooldown, cap 15 a week.
// U1..U10 belong to PM001, X1 to PM002, ARCH is archived.

describe('KudosService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const id = (name: string) => `TK${name}${tag}`;
  const U = Array.from({ length: 10 }, (_, i) => id(`U${i + 1}`));
  const X1 = id('X1');
  const ARCH = id('AR');

  let prisma: PrismaService;
  let notices: FakeEngagementNotifications;
  let ledger: XpLedgerService;
  let kudos: KudosService;
  let query: KudosQueryService;
  let workspaceId: string;
  let now = new Date('2026-11-16T06:00:00Z');

  const at = (day: string) => {
    now = new Date(`${day}T06:00:00Z`); // noon in Dhaka
  };
  const send = (from: string, to: string, over: Partial<SendKudosInput> = {}) =>
    kudos.send({ workspaceId, fromUserId: from, toUserId: to, category: 'HELPFUL', message: 'Thanks for the help', ...over });
  const eventOf = (kudosId: string) =>
    prisma.xpEvent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key: `kudos:${kudosId}` } } });
  const makeUser = (userId: string, pmId: string, archivedAt: Date | null = null) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@kudos-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        archivedAt,
      },
    });
  const setRule = (data: { kudos?: number; kudosReceivedCapPerWeek?: number; kudosSendLimitPerWeek?: number }) =>
    prisma.xpRule.update({ where: { workspaceId }, data });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Kudos test', slug: `t-kudos-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    for (const userId of U) await makeUser(userId, 'PM001');
    await makeUser(X1, 'PM002');
    await makeUser(ARCH, 'PM001', new Date('2026-06-01T00:00:00Z'));
  });

  beforeEach(() => {
    notices = new FakeEngagementNotifications();
    ledger = new XpLedgerService(prisma);
    kudos = new KudosService(prisma, ledger, new XpRulesService(prisma), notices, { now: () => now });
    query = new KudosQueryService(prisma);
    at('2026-11-16');
  });

  afterEach(async () => {
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.kudos.deleteMany({ where: { workspaceId } });
    await setRule({ kudos: 5, kudosReceivedCapPerWeek: 15, kudosSendLimitPerWeek: 3 });
  });

  afterAll(async () => {
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.kudos.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('sending', () => {
    it('saves the kudos, creates ONE pending event for the receiver at the rule amount, and tells the receiver', async () => {
      const result = await send(U[0]!, U[1]!, { message: '  Great demo!  ', category: 'TEAMWORK' });

      const row = await prisma.kudos.findUniqueOrThrow({ where: { id: result.kudosId } });
      expect(row).toMatchObject({ fromUserId: U[0], toUserId: U[1], category: 'TEAMWORK', message: 'Great demo!', suspicious: false });
      expect(row.sentOn.toISOString().slice(0, 10)).toBe('2026-11-16');

      const event = await eventOf(result.kudosId);
      expect(event).toMatchObject({ userId: U[1], source: 'KUDOS', status: 'PENDING', amount: 5, kudosId: result.kudosId, flag: null });
      expect(event.evidence).toContain(`Name ${U[0]}`);
      expect(event.evidence).toContain('TEAMWORK');

      expect(notices.userNotices).toHaveLength(1);
      expect(notices.userNotices[0]).toMatchObject({ userId: U[1], category: 'Kudos received' });
      expect(notices.userNotices[0]?.message).toContain('Great demo!');
      expect(notices.userNotices[0]?.message).toContain(`Name ${U[0]}`);
      expect(notices.pmNotices).toHaveLength(0);
    });

    it('uses the XP amount from the rules at that moment', async () => {
      await setRule({ kudos: 9 });
      const result = await send(U[0]!, U[1]!);
      expect(result.amount).toBe(9);
      expect((await eventOf(result.kudosId)).amount).toBe(9);
    });

    it('ignores any date from the caller: the day is the server\'s today in Dhaka', async () => {
      at('2026-11-18');
      const result = await send(U[0]!, U[1]!, { sentOn: '1999-01-01' } as never);
      const row = await prisma.kudos.findUniqueOrThrow({ where: { id: result.kudosId } });
      expect(row.sentOn.toISOString().slice(0, 10)).toBe('2026-11-18');
    });

    it('refuses self kudos, a blank message and an unknown category, and writes nothing', async () => {
      await expect(send(U[0]!, U[0]!)).rejects.toMatchObject({ code: 'SELF_KUDOS' });
      await expect(send(U[0]!, U[1]!, { message: '   ' })).rejects.toMatchObject({ code: 'MESSAGE_REQUIRED' });
      await expect(send(U[0]!, U[1]!, { category: 'PRAISE' as never })).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await prisma.kudos.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(0);
    });

    it('refuses an archived sender or receiver (USER_ARCHIVED) and an unknown user (NOT_FOUND)', async () => {
      await expect(send(U[0]!, ARCH)).rejects.toMatchObject({ code: 'USER_ARCHIVED' });
      await expect(send(ARCH, U[0]!)).rejects.toMatchObject({ code: 'USER_ARCHIVED' });
      await expect(send(U[0]!, 'BS99999')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(
        kudos.send({ workspaceId: randomUUID(), fromUserId: U[0]!, toUserId: U[1]!, category: 'HELPFUL', message: 'x' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('a refused kudos creates no notice at all (self, blank, archived, limit, cooldown)', async () => {
      await send(U[0]!, U[1]!);
      const sentSoFar = notices.userNotices.length + notices.pmNotices.length;
      await expect(send(U[0]!, U[0]!)).rejects.toBeDefined();
      await expect(send(U[0]!, U[2]!, { message: ' ' })).rejects.toBeDefined();
      await expect(send(U[0]!, ARCH)).rejects.toBeDefined();
      await expect(send(U[0]!, U[1]!)).rejects.toBeDefined(); // cooldown
      await send(U[0]!, U[2]!);
      await send(U[0]!, U[3]!);
      await expect(send(U[0]!, U[4]!)).rejects.toBeDefined(); // limit
      expect(notices.userNotices.length + notices.pmNotices.length).toBe(sentSoFar + 2); // only the two that worked
    });

    it('the database itself refuses a kudos to oneself', async () => {
      await expect(
        prisma.kudos.create({
          data: { workspaceId, fromUserId: U[0]!, toUserId: U[0]!, category: 'HELPFUL', message: 'x', sentOn: parseDay('2026-11-16') },
        }),
      ).rejects.toThrow();
    });

    it('rolls everything back when the notice fails', async () => {
      notices.failNext(new Error('outbox down'));
      await expect(send(U[0]!, U[1]!)).rejects.toThrow('outbox down');
      expect(await prisma.kudos.count({ where: { workspaceId } })).toBe(0);
      expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('weekly send limit and cooldown', () => {
    it('refuses the 4th kudos in a week (SEND_LIMIT), but allows again on the next Monday', async () => {
      at('2026-11-16');
      await send(U[0]!, U[1]!);
      await send(U[0]!, U[2]!);
      await send(U[0]!, U[3]!);
      await expect(send(U[0]!, U[4]!)).rejects.toMatchObject({ code: 'SEND_LIMIT' });
      at('2026-11-22'); // Sunday: still the same week
      await expect(send(U[0]!, U[4]!)).rejects.toMatchObject({ code: 'SEND_LIMIT' });
      at('2026-11-23'); // Monday: a new week
      await expect(send(U[0]!, U[4]!)).resolves.toBeDefined();
    });

    it('refuses a second kudos to the same person inside 7 days (COOLDOWN), another person is fine', async () => {
      await send(U[0]!, U[1]!);
      at('2026-11-17');
      await expect(send(U[0]!, U[1]!)).rejects.toMatchObject({ code: 'COOLDOWN' });
      await expect(send(U[0]!, U[2]!)).resolves.toBeDefined();
    });

    it('allows the same person again after the full cooldown (7 days later)', async () => {
      await send(U[0]!, U[1]!);
      at('2026-11-22');
      await expect(send(U[0]!, U[1]!)).rejects.toMatchObject({ code: 'COOLDOWN' }); // 6 days
      at('2026-11-23');
      await expect(send(U[0]!, U[1]!)).resolves.toBeDefined(); // 7 days
    });

    it('never lets more than the limit through when 8 sends arrive at once', async () => {
      const attempts = await Promise.allSettled(U.slice(1, 9).map((to) => send(U[0]!, to)));
      expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(3);
      for (const a of attempts.filter((x) => x.status === 'rejected')) {
        expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'SEND_LIMIT' });
      }
      expect(await prisma.kudos.count({ where: { fromUserId: U[0] } })).toBe(3);
    });
  });

  describe('mutual (suspicious) kudos', () => {
    it('flags both, holds the new XP, moves the earlier pending XP to HELD with no review row, tells the PM once (same PM)', async () => {
      at('2026-11-16');
      const first = await send(U[0]!, U[1]!);
      at('2026-11-18');
      notices.userNotices.length = 0;
      const second = await send(U[1]!, U[0]!);

      expect(second).toMatchObject({ suspicious: true, flag: 'Suspicious exchange' });
      expect(await eventOf(second.kudosId)).toMatchObject({ status: 'HELD', flag: 'Suspicious exchange', amount: 5 });
      expect(await eventOf(first.kudosId)).toMatchObject({ status: 'HELD', flag: 'Suspicious exchange' });
      expect((await prisma.kudos.findUniqueOrThrow({ where: { id: first.kudosId } })).suspicious).toBe(true);
      expect((await prisma.kudos.findUniqueOrThrow({ where: { id: second.kudosId } })).suspicious).toBe(true);
      expect(await prisma.xpReview.count({ where: { workspaceId } })).toBe(0);

      expect(notices.pmNotices).toHaveLength(1); // both people belong to PM001
      expect(notices.pmNotices[0]).toMatchObject({ pmId: 'PM001', category: 'Suspicious kudos' });
    });

    it('tells the PM of EACH person when they have different PMs', async () => {
      await send(U[0]!, X1);
      await send(X1, U[0]!);
      expect(notices.pmNotices.map((n) => n.pmId).sort()).toEqual(['PM001', 'PM002']);
    });

    it('an earlier event that is already AWARDED stays awarded, but is flagged', async () => {
      const first = await send(U[0]!, U[1]!);
      await prisma.xpEvent.update({ where: { workspaceId_key: { workspaceId, key: `kudos:${first.kudosId}` } }, data: { status: 'AWARDED' } });
      await send(U[1]!, U[0]!);
      expect(await eventOf(first.kudosId)).toMatchObject({ status: 'AWARDED', flag: 'Suspicious exchange' });
    });

    it('Monday then the following Sunday ARE the same week', async () => {
      at('2026-11-16');
      await send(U[0]!, U[1]!);
      at('2026-11-22');
      expect((await send(U[1]!, U[0]!)).suspicious).toBe(true);
    });

    it('Sunday then the next Monday are NOT the same week', async () => {
      at('2026-11-22');
      await send(U[0]!, U[1]!);
      at('2026-11-23');
      const reply = await send(U[1]!, U[0]!);
      expect(reply.suspicious).toBe(false);
      expect((await eventOf(reply.kudosId)).status).toBe('PENDING');
    });

    it('flags both kudos when A to B and B to A are sent at the same moment (and never deadlocks)', async () => {
      const [a, b] = await Promise.all([send(U[0]!, U[1]!), send(U[1]!, U[0]!)]);
      expect(
        (await prisma.kudos.findMany({ where: { id: { in: [a.kudosId, b.kudosId] } } })).every((k) => k.suspicious),
      ).toBe(true);
      expect((await eventOf(a.kudosId)).status).toBe('HELD');
      expect((await eventOf(b.kudosId)).status).toBe('HELD');
    });
  });

  describe('weekly received cap', () => {
    it('pays 0 (with the cap flag) once the receiver would go over, but still creates the kudos and event', async () => {
      for (const sender of [U[0]!, U[1]!, U[2]!]) await send(sender, U[9]!); // 3 x 5 = 15
      const fourth = await send(U[3]!, U[9]!);
      expect(fourth).toMatchObject({ amount: 0, flag: 'Weekly received cap reached' });
      expect(await eventOf(fourth.kudosId)).toMatchObject({ amount: 0, status: 'PENDING', flag: 'Weekly received cap reached' });
      expect(await prisma.kudos.findUnique({ where: { id: fourth.kudosId } })).not.toBeNull();
    });

    it('pays 0, never a partial amount (10 received, 5 more, cap 12)', async () => {
      await setRule({ kudosReceivedCapPerWeek: 12 });
      await send(U[0]!, U[9]!);
      await send(U[1]!, U[9]!); // 10
      const third = await send(U[2]!, U[9]!);
      expect(third.amount).toBe(0); // not 2
    });

    it('resets on the next Monday', async () => {
      for (const sender of [U[0]!, U[1]!, U[2]!, U[3]!]) await send(sender, U[9]!);
      at('2026-11-23');
      expect((await send(U[4]!, U[9]!)).amount).toBe(5);
    });

    it('rejected and reversed kudos do not use the cap up; pending, held and awarded do', async () => {
      const k = [] as string[];
      for (const sender of [U[0]!, U[1]!, U[2]!]) k.push((await send(sender, U[9]!)).kudosId);
      // free the cap: reject one, reverse another
      await prisma.xpEvent.update({ where: { workspaceId_key: { workspaceId, key: `kudos:${k[0]}` } }, data: { status: 'REJECTED' } });
      await prisma.xpEvent.update({ where: { workspaceId_key: { workspaceId, key: `kudos:${k[1]}` } }, data: { status: 'REVERSED' } });
      expect((await send(U[3]!, U[9]!)).amount).toBe(5); // 5 used, room for 10 more
      expect((await send(U[4]!, U[9]!)).amount).toBe(5);
      expect((await send(U[5]!, U[9]!)).amount).toBe(0); // 15 used again: pending kudos count
    });

    it('a mutual kudos that is also over the cap carries the "Suspicious exchange" flag and pays 0', async () => {
      await setRule({ kudosReceivedCapPerWeek: 5 });
      await send(U[0]!, U[9]!); // the receiver U10 already has 5 (the cap)
      await send(U[9]!, U[1]!);
      const reply = await send(U[1]!, U[9]!); // mutual with U10's kudos, and U10 is at the cap
      expect(reply).toMatchObject({ suspicious: true, amount: 0, flag: 'Suspicious exchange' });
    });

    it('never goes over the cap when 6 kudos to one person arrive at once', async () => {
      const results = await Promise.all(U.slice(0, 6).map((sender) => send(sender, U[9]!)));
      const paid = results.reduce((sum, r) => sum + r.amount, 0);
      expect(paid).toBe(15); // exactly 3 x 5
      expect(results.filter((r) => r.amount === 0)).toHaveLength(3);
    });
  });

  describe('IF-04: distinctApprovedSenders', () => {
    const setStatus = (kudosId: string, status: 'AWARDED' | 'REJECTED' | 'REVERSED' | 'HELD') =>
      prisma.xpEvent.update({ where: { workspaceId_key: { workspaceId, key: `kudos:${kudosId}` } }, data: { status } });

    it('counts different senders whose kudos are AWARDED, and nothing else', async () => {
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(0);
      const a = await send(U[0]!, U[9]!); // stays PENDING
      const b = await send(U[1]!, U[9]!);
      const c = await send(U[2]!, U[9]!);
      const d = await send(U[3]!, U[9]!);
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(0); // nothing approved yet

      await setStatus(b.kudosId, 'AWARDED');
      await setStatus(c.kudosId, 'REJECTED');
      await setStatus(d.kudosId, 'HELD');
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(1);

      await setStatus(a.kudosId, 'AWARDED');
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(2);
      await setStatus(a.kudosId, 'REVERSED');
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(1);
    });

    it('counts one sender once, however many approved kudos they sent', async () => {
      const first = await send(U[0]!, U[9]!);
      at('2026-11-23');
      const second = await send(U[0]!, U[9]!); // cooldown has passed
      await setStatus(first.kudosId, 'AWARDED');
      await setStatus(second.kudosId, 'AWARDED');
      expect(await query.distinctApprovedSenders(prisma, U[9]!)).toBe(1);
    });
  });

  describe('who sees what', () => {
    it('a user sees only the kudos they sent or received; a PM only those that involve their own users', async () => {
      const own = await send(U[0]!, U[1]!); // PM001 people
      const other = await send(X1, U[2]!); // involves PM002's user and a PM001 user
      const lone = await send(U[3]!, U[4]!); // only PM001 people

      const forU1 = (await query.listForUser(workspaceId, U[0]!)).map((k) => k.id);
      expect(forU1).toEqual([own.kudosId]);
      expect((await query.listForUser(workspaceId, U[5]!))).toEqual([]);

      const pm1 = (await query.listForPm(workspaceId, 'PM001')).map((k) => k.id).sort();
      expect(pm1).toEqual([own.kudosId, other.kudosId, lone.kudosId].sort()); // each involves a PM001 user
      const pm2 = (await query.listForPm(workspaceId, 'PM002')).map((k) => k.id);
      expect(pm2).toEqual([other.kudosId]); // only the one that involves X1
    });
  });
});
