import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { createTestPrisma, loadSeed } from '../testing/test-db.js';
import { orgToday, parseDay } from '../time/org-time.js';
import { manualKey } from './xp-keys.js';
import { XpAdjustmentService } from './xp-adjustment.service.js';
import { XpLedgerService } from './xp-ledger.service.js';

// Needs the local database (pnpm infra:up, db:deploy, db:seed). Run: pnpm --filter api test:e2e
// Spec files run in parallel and compare XP totals, so this file makes its OWN temporary user
// (managed by PM001) and removes it, and its XP events, afterwards.

describe('XpAdjustmentService (database)', () => {
  const tag = randomUUID().slice(0, 8);
  const USER = `TADJ${tag}`;
  const FIXED_NOW = new Date('2031-08-05T05:00:00Z'); // 11:00 in Dhaka, 2031-08-05
  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let adjust: XpAdjustmentService;
  let workspaceId: string;

  const total = () => ledger.awardedTotal(USER);
  const doAdjust = (amount: number, reason = 'Correcting a mistake', pmId = 'PM001') =>
    adjust.adjust({ workspaceId, userId: USER, pmId, amount, reason });
  const seed = (amount: number) =>
    ledger.createEvent({
      workspaceId,
      userId: USER,
      source: 'QUEST',
      amount,
      key: `quest:${randomUUID()}:${USER}`,
      evidence: 'test seed XP',
      occurredOn: parseDay('2031-08-01'),
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    ledger = new XpLedgerService(prisma);
    adjust = new XpAdjustmentService(prisma, ledger, { now: () => FIXED_NOW });
    ({ workspaceId } = await loadSeed(prisma));
    await prisma.user.create({
      data: {
        userId: USER,
        workspaceId,
        email: `${USER.toLowerCase()}@adjust-test.invalid`,
        name: 'Adjustment test user',
        resource: 'TRAINEE',
        pmId: 'PM001',
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2031-01-01'),
      },
    });
  });

  afterEach(async () => {
    await prisma.xpEvent.deleteMany({ where: { userId: USER } });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { userId: USER } });
    await prisma.user.deleteMany({ where: { userId: USER } });
    await prisma.$disconnect();
  });

  it('awards at once: AWARDED, a manual key, the reason, today (Dhaka), and no review row', async () => {
    await seed(40);
    const result = await doAdjust(-15, '  Awarded twice by mistake ');

    expect(result.newTotal).toBe(25);
    expect(await total()).toBe(25);
    const row = await prisma.xpEvent.findUniqueOrThrow({ where: { id: result.eventId } });
    expect(row).toMatchObject({
      source: 'MANUAL_ADJUSTMENT',
      status: 'AWARDED',
      amount: -15,
      reason: 'Awarded twice by mistake',
      userId: USER,
    });
    expect(row.key.startsWith('manual:')).toBe(true);
    expect(() => manualKey(row.key.slice('manual:'.length))).not.toThrow();
    expect(row.evidence).toContain('PM001');
    expect(row.occurredOn.toISOString().slice(0, 10)).toBe(orgToday(FIXED_NOW));
    expect(await prisma.xpReview.count({ where: { xpEventId: result.eventId } })).toBe(0);
  });

  it('can add XP too, and two identical adjustments are two events (no idempotency key from the caller)', async () => {
    await doAdjust(10);
    await doAdjust(10);
    expect(await total()).toBe(20);
    expect(await prisma.xpEvent.count({ where: { userId: USER } })).toBe(2);
  });

  it('refuses an adjustment that would take the total below zero (NEGATIVE_TOTAL), and writes nothing', async () => {
    await seed(10);
    await expect(doAdjust(-11)).rejects.toMatchObject({ code: 'NEGATIVE_TOTAL' });
    expect(await total()).toBe(10);
    expect(await prisma.xpEvent.count({ where: { userId: USER } })).toBe(1);
  });

  it('allows an adjustment that lands exactly on zero', async () => {
    await seed(10);
    const result = await doAdjust(-10);
    expect(result.newTotal).toBe(0);
    expect(await total()).toBe(0);
  });

  it('refuses any negative adjustment for a user with no XP', async () => {
    await expect(doAdjust(-1)).rejects.toMatchObject({ code: 'NEGATIVE_TOTAL' });
  });

  it('only counts awarded XP: pending XP does not make room for a negative adjustment', async () => {
    await seed(5);
    await ledger.createEvent({
      workspaceId,
      userId: USER,
      source: 'ON_TIME_SPRINT',
      amount: 20,
      key: `sprint:${USER}:2031-08-02`,
      evidence: 'pending sprint',
      occurredOn: parseDay('2031-08-02'),
    }); // PENDING
    await expect(doAdjust(-6)).rejects.toMatchObject({ code: 'NEGATIVE_TOTAL' });
  });

  it('lets exactly 2 of 6 simultaneous -4 adjustments through from a total of 10, and the total never goes negative', async () => {
    await seed(10);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => doAdjust(-4)));
    const won = attempts.filter((a) => a.status === 'fulfilled');
    expect(won).toHaveLength(2);
    for (const a of attempts.filter((x) => x.status === 'rejected')) {
      expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'NEGATIVE_TOTAL' });
    }
    expect(await total()).toBe(2);
  });

  it('refuses another PM\'s user (FORBIDDEN_SCOPE), but the owner can', async () => {
    await expect(doAdjust(5, 'Checked', 'PM002')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(await prisma.xpEvent.count({ where: { userId: USER } })).toBe(0);
    await expect(doAdjust(5, 'Checked', 'PM001')).resolves.toMatchObject({ newTotal: 5 });
  });

  it('returns NOT_FOUND for an unknown user or a user in another workspace', async () => {
    await expect(
      adjust.adjust({ workspaceId, userId: 'BS99999', pmId: 'PM001', amount: 5, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      adjust.adjust({ workspaceId: randomUUID(), userId: USER, pmId: 'PM001', amount: 5, reason: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('validates before touching the database: AMOUNT and REASON_REQUIRED, nothing written', async () => {
    await expect(doAdjust(0)).rejects.toMatchObject({ code: 'AMOUNT' });
    await expect(doAdjust(2.5)).rejects.toMatchObject({ code: 'AMOUNT' });
    await expect(doAdjust(5, '   ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    expect(await prisma.xpEvent.count({ where: { userId: USER } })).toBe(0);
  });

  it('creates no notice when an adjustment crosses a level (it is not earned XP)', async () => {
    const levels = await prisma.level.findMany({ where: { workspaceId, retiredAt: null }, orderBy: { minXp: 'asc' } });
    const threshold = levels.find((l) => l.minXp > 0)?.minXp ?? 250;
    const noticesBefore = await prisma.notification.count({ where: { userId: USER } });

    await doAdjust(threshold + 5, 'Correction that crosses a level');

    expect(await total()).toBe(threshold + 5);
    expect(await prisma.notification.count({ where: { userId: USER } })).toBe(noticesBefore);
  });
});
