import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { createTestPrisma, loadSeed } from '../testing/test-db.js';
import { parseDay } from '../time/org-time.js';
import { manualKey } from './xp-keys.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { NewXpEvent } from './xp-ledger.types.js';

// Needs the local database: pnpm infra:up, db:deploy, db:seed. Run: pnpm --filter api test:e2e
// Each test tags its rows with a run id in `evidence` and deletes only those rows afterwards.

describe('XpLedgerService (database)', () => {
  const runTag = `[test:${randomUUID()}]`;
  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let workspaceId: string;
  let userA: string;
  let userB: string;
  const createdKudosIds: string[] = [];

  const event = (overrides: Partial<NewXpEvent> = {}): NewXpEvent => ({
    workspaceId,
    userId: userA,
    source: 'MANUAL_ADJUSTMENT',
    amount: 10,
    key: manualKey(randomUUID()),
    evidence: `${runTag} test event`,
    occurredOn: parseDay('2031-03-10'),
    ...overrides,
  });

  beforeAll(async () => {
    prisma = createTestPrisma();
    ledger = new XpLedgerService(prisma);
    const seed = await loadSeed(prisma);
    workspaceId = seed.workspaceId;
    [userA, userB] = seed.users as [string, string];
  });

  afterEach(async () => {
    await prisma.xpEvent.deleteMany({ where: { evidence: { startsWith: runTag } } });
    if (createdKudosIds.length > 0) {
      await prisma.kudos.deleteMany({ where: { id: { in: createdKudosIds } } });
      createdKudosIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates an event once and returns created = true', async () => {
    const input = event();
    const result = await ledger.createEvent(input);
    expect(result.created).toBe(true);
    const rows = await prisma.xpEvent.findMany({ where: { workspaceId, key: input.key } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: userA, amount: 10, source: 'MANUAL_ADJUSTMENT' });
  });

  it('creates ONE event when the same key is reported twice', async () => {
    const input = event();
    const first = await ledger.createEvent(input);
    const second = await ledger.createEvent(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
    expect(await prisma.xpEvent.count({ where: { workspaceId, key: input.key } })).toBe(1);
  });

  it('creates ONE event when the same key arrives 8 times at once', async () => {
    const input = event();
    const results = await Promise.all(Array.from({ length: 8 }, () => ledger.createEvent(input)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.event.id)).size).toBe(1);
    expect(await prisma.xpEvent.count({ where: { workspaceId, key: input.key } })).toBe(1);
  });

  it('does not create a duplicate inside a transaction that already used the key', async () => {
    const input = event();
    await prisma.$transaction(async (tx) => {
      const first = await ledger.createEvent(input, tx);
      const second = await ledger.createEvent(input, tx); // would abort the transaction on a plain INSERT error
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    });
    expect(await prisma.xpEvent.count({ where: { workspaceId, key: input.key } })).toBe(1);
  });

  it('starts quest and manual XP as AWARDED and everything else as PENDING', async () => {
    const quest = event({ source: 'QUEST', key: `quest:${randomUUID()}:${userA}` });
    const sprint = event({ source: 'ON_TIME_SPRINT', key: `sprint:${userA}:2031-03-11` });
    const manual = event();
    await ledger.createEvent(quest);
    await ledger.createEvent(sprint);
    await ledger.createEvent(manual);
    const statusOf = async (key: string) =>
      (await prisma.xpEvent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key } } })).status;
    expect(await statusOf(quest.key)).toBe('AWARDED');
    expect(await statusOf(sprint.key)).toBe('PENDING');
    expect(await statusOf(manual.key)).toBe('AWARDED');
  });

  it('respects an explicit HELD status and flag', async () => {
    const input = event({ source: 'ON_TIME_SPRINT', key: `sprint:${userA}:2031-03-12`, status: 'HELD', flag: 'Suspicious exchange' });
    await ledger.createEvent(input);
    const row = await prisma.xpEvent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key: input.key } } });
    expect(row).toMatchObject({ status: 'HELD', flag: 'Suspicious exchange' });
  });

  it('rejects a non-integer amount and a blank evidence', async () => {
    await expect(ledger.createEvent(event({ amount: 1.5 }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(ledger.createEvent(event({ evidence: '   ' }))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(ledger.createEvent(event({ key: '' }))).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('counts only AWARDED XP in a total', async () => {
    const before = await ledger.awardedTotal(userA);
    await ledger.createEvent(event({ amount: 15 })); // manual: AWARDED
    await ledger.createEvent(event({ amount: 20, status: 'PENDING' }));
    await ledger.createEvent(event({ amount: 30, status: 'HELD' }));
    await ledger.createEvent(event({ amount: 40, status: 'REJECTED' }));
    await ledger.createEvent(event({ amount: 50, status: 'REVERSED' }));
    expect(await ledger.awardedTotal(userA)).toBe(before + 15);
  });

  it('returns awarded totals for several users inside a date window, 0 for no events', async () => {
    const q = { workspaceId, userIds: [userA, userB], from: parseDay('2031-04-01'), to: parseDay('2031-04-30') };
    const before = await ledger.awardedTotals(q);
    await ledger.createEvent(event({ amount: 5, occurredOn: parseDay('2031-04-01') })); // in window (edge)
    await ledger.createEvent(event({ amount: 7, occurredOn: parseDay('2031-04-30') })); // in window (edge)
    await ledger.createEvent(event({ amount: 100, occurredOn: parseDay('2031-05-01') })); // outside
    await ledger.createEvent(event({ amount: 100, occurredOn: parseDay('2031-03-31') })); // outside
    await ledger.createEvent(event({ amount: 9, status: 'PENDING', occurredOn: parseDay('2031-04-15') })); // not awarded
    const after = await ledger.awardedTotals(q);
    expect(after.get(userA)).toBe((before.get(userA) ?? 0) + 12);
    expect(after.get(userB)).toBe(before.get(userB) ?? 0);
    expect(after.has(userB)).toBe(true); // a user with no events is still in the map, as 0
  });

  it('moves PENDING kudos events to HELD with a flag, leaving other statuses alone, and writes no review row', async () => {
    const mkKudos = async () => {
      const k = await prisma.kudos.create({
        data: { workspaceId, fromUserId: userB, toUserId: userA, category: 'HELPFUL', message: `${runTag} kudos`, sentOn: parseDay('2031-03-10') },
      });
      createdKudosIds.push(k.id);
      return k.id;
    };
    const pendingId = await mkKudos();
    const awardedId = await mkKudos();
    await ledger.createEvent(event({ source: 'KUDOS', key: `kudos:${pendingId}`, kudosId: pendingId, status: 'PENDING' }));
    await ledger.createEvent(event({ source: 'KUDOS', key: `kudos:${awardedId}`, kudosId: awardedId, status: 'AWARDED' }));
    // Count review rows for THESE events only: other spec files write reviews in parallel.
    const ownReviews = () => prisma.xpReview.count({ where: { xpEvent: { kudosId: { in: [pendingId, awardedId] } } } });

    await ledger.holdPending([pendingId, awardedId], 'Suspicious exchange');

    const pending = await prisma.xpEvent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key: `kudos:${pendingId}` } } });
    const awarded = await prisma.xpEvent.findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key: `kudos:${awardedId}` } } });
    expect(pending).toMatchObject({ status: 'HELD', flag: 'Suspicious exchange' });
    expect(awarded.status).toBe('AWARDED');
    expect(await ownReviews()).toBe(0);
  });

  it('does nothing for an empty kudos list', async () => {
    await expect(ledger.holdPending([], 'x')).resolves.toBeUndefined();
  });
});
