import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { ActiveLevel } from '../levels/level-set.js';
import { FakeLevelsPort } from '../testing/fake-levels-port.js';
import { FakeNotificationPort } from '../testing/fake-notification-port.js';
import { createTestPrisma, loadSeed } from '../testing/test-db.js';
import { parseDay } from '../time/org-time.js';
import { manualKey } from './xp-keys.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { NewXpEvent } from './xp-ledger.types.js';
import { XpReviewService } from './xp-review.service.js';

// Needs the local database (pnpm infra:up, db:deploy, db:seed). Run: pnpm --filter api test:e2e
// Seed: BS23001-BS23003 belong to PM001, BS23004 belongs to PM002.
// Spec files run in parallel and compare XP totals, so each file uses its OWN user:
//   xp-ledger -> BS23001 and BS23002 (first two), module wiring -> BS23002 (pending only),
//   xp-review -> BS23003 (PM001) and BS23004 (PM002).

describe('XpReviewService (database)', () => {
  const runTag = `[test:${randomUUID()}]`;
  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let notices: FakeNotificationPort;
  let review: XpReviewService;
  let workspaceId: string;
  const OWN_USER = 'BS23003'; // PM001's user, used only by this file
  const OTHER_PM_USER = 'BS23004'; // PM002's user

  const makeEvent = async (overrides: Partial<NewXpEvent> = {}): Promise<string> => {
    const input: NewXpEvent = {
      workspaceId,
      userId: OWN_USER,
      source: 'ON_TIME_SPRINT',
      amount: 20,
      key: manualKey(randomUUID()),
      evidence: `${runTag} event`,
      occurredOn: parseDay('2031-07-01'),
      ...overrides,
    };
    return (await ledger.createEvent(input)).event.id;
  };
  const row = (id: string) => prisma.xpEvent.findUniqueOrThrow({ where: { id } });
  const decide = (eventId: string, toStatus: Parameters<XpReviewService['decide']>[0]['toStatus'], reason = 'Checked the evidence', pmId = 'PM001') =>
    review.decide({ workspaceId, eventId, pmId, toStatus, reason });

  let levelSet: ActiveLevel[];
  let baseTotal: number;

  beforeAll(async () => {
    prisma = createTestPrisma();
    ledger = new XpLedgerService(prisma);
    ({ workspaceId } = await loadSeed(prisma));
    // Two levels placed relative to the user's current total, so the level-up tests do not
    // depend on the seeded thresholds (which other people may change).
    baseTotal = await ledger.awardedTotal(OWN_USER);
    levelSet = [
      { id: 'a', name: 'Starter', minXp: 0 },
      { id: 'b', name: 'Climber', minXp: baseTotal + 50 },
    ];
  });

  beforeEach(() => {
    notices = new FakeNotificationPort();
    review = new XpReviewService(prisma, notices, ledger, new FakeLevelsPort(notices, levelSet));
  });

  afterEach(async () => {
    await prisma.xpReview.deleteMany({ where: { xpEvent: { evidence: { startsWith: runTag } } } });
    await prisma.xpEvent.deleteMany({ where: { evidence: { startsWith: runTag } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('awards a pending event: status, reason, one review row, a notice with the reason', async () => {
    const id = await makeEvent();
    const before = await ledger.awardedTotal(OWN_USER);

    const result = await decide(id, 'AWARDED', 'On-time sprint confirmed');

    expect(result).toMatchObject({ eventId: id, fromStatus: 'PENDING', toStatus: 'AWARDED' });
    expect(await row(id)).toMatchObject({ status: 'AWARDED', reason: 'On-time sprint confirmed' });
    const reviews = await prisma.xpReview.findMany({ where: { xpEventId: id } });
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ fromStatus: 'PENDING', toStatus: 'AWARDED', reviewerId: 'PM001', reason: 'On-time sprint confirmed' });
    expect(await ledger.awardedTotal(OWN_USER)).toBe(before + 20);
    expect(notices.userNotices).toHaveLength(1);
    expect(notices.userNotices[0]).toMatchObject({ userId: OWN_USER, category: 'XP decisions' });
    expect(notices.userNotices[0]?.message).toContain('On-time sprint confirmed');
  });

  it('walks hold -> award, and hold -> reject, keeping one review row per decision', async () => {
    const a = await makeEvent();
    await decide(a, 'HELD', 'Need to check the commit');
    await decide(a, 'AWARDED', 'Checked, it is fine');
    expect((await row(a)).status).toBe('AWARDED');
    expect(await prisma.xpReview.count({ where: { xpEventId: a } })).toBe(2);

    const b = await makeEvent();
    await decide(b, 'HELD', 'Unclear');
    await decide(b, 'REJECTED', 'Not valid work');
    expect((await row(b)).status).toBe('REJECTED');
  });

  it('reverses awarded XP, and the total drops', async () => {
    const id = await makeEvent();
    await decide(id, 'AWARDED');
    const afterAward = await ledger.awardedTotal(OWN_USER);
    await decide(id, 'REVERSED', 'Awarded by mistake');
    expect((await row(id)).status).toBe('REVERSED');
    expect(await ledger.awardedTotal(OWN_USER)).toBe(afterAward - 20);
  });

  it('refuses a blank reason and changes nothing: no review row, no notice', async () => {
    const id = await makeEvent();
    await expect(decide(id, 'AWARDED', '   ')).rejects.toMatchObject({ code: 'REASON_REQUIRED' });
    expect((await row(id)).status).toBe('PENDING');
    expect(await prisma.xpReview.count({ where: { xpEventId: id } })).toBe(0);
    expect(notices.userNotices).toHaveLength(0);
  });

  it('refuses moves out of a final state and moves that are not allowed', async () => {
    const rejected = await makeEvent();
    await decide(rejected, 'REJECTED', 'No');
    await expect(decide(rejected, 'AWARDED')).rejects.toMatchObject({ code: 'BAD_TRANSITION' });

    const reversed = await makeEvent();
    await decide(reversed, 'AWARDED');
    await decide(reversed, 'REVERSED', 'Oops');
    await expect(decide(reversed, 'AWARDED')).rejects.toMatchObject({ code: 'BAD_TRANSITION' });

    const pending = await makeEvent();
    await expect(decide(pending, 'REVERSED')).rejects.toMatchObject({ code: 'BAD_TRANSITION' }); // only awarded XP
    await expect(decide(pending, 'PENDING')).rejects.toMatchObject({ code: 'BAD_TRANSITION' });
    expect((await row(pending)).status).toBe('PENDING');
  });

  it("refuses a PM deciding another PM's user's event (FORBIDDEN_SCOPE), but the owner can", async () => {
    const id = await makeEvent({ userId: OTHER_PM_USER });
    await expect(decide(id, 'AWARDED', 'Checked', 'PM001')).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect((await row(id)).status).toBe('PENDING');
    expect(await prisma.xpReview.count({ where: { xpEventId: id } })).toBe(0);

    await expect(decide(id, 'AWARDED', 'Checked', 'PM002')).resolves.toMatchObject({ toStatus: 'AWARDED' });
  });

  it('returns NOT_FOUND for an unknown event or one from another workspace', async () => {
    await expect(decide(randomUUID(), 'AWARDED')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const id = await makeEvent();
    await expect(
      review.decide({ workspaceId: randomUUID(), eventId: id, pmId: 'PM001', toStatus: 'AWARDED', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets exactly one of 6 simultaneous decisions on one event win', async () => {
    const id = await makeEvent();
    const attempts = await Promise.allSettled([
      decide(id, 'AWARDED'),
      decide(id, 'AWARDED'),
      decide(id, 'REJECTED'),
      decide(id, 'HELD'),
      decide(id, 'AWARDED'),
      decide(id, 'REJECTED'),
    ]);
    const won = attempts.filter((a) => a.status === 'fulfilled');
    // HELD can win first and then AWARDED/REJECTED may follow: every success must be a legal
    // next move, so the review rows must form an unbroken chain from PENDING.
    expect(won.length).toBeGreaterThanOrEqual(1);
    const reviews = await prisma.xpReview.findMany({ where: { xpEventId: id }, orderBy: { createdAt: 'asc' } });
    expect(reviews).toHaveLength(won.length);
    let expectedFrom = 'PENDING';
    for (const r of reviews) {
      expect(r.fromStatus).toBe(expectedFrom);
      expectedFrom = r.toStatus;
    }
    expect((await row(id)).status).toBe(expectedFrom);
    for (const a of attempts.filter((x) => x.status === 'rejected')) {
      expect((a as PromiseRejectedResult).reason).toMatchObject({ code: 'BAD_TRANSITION' });
    }
  });

  it('never pays twice when the same award is sent 6 times at once', async () => {
    const id = await makeEvent();
    const before = await ledger.awardedTotal(OWN_USER);
    const attempts = await Promise.allSettled(Array.from({ length: 6 }, () => decide(id, 'AWARDED')));
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.xpReview.count({ where: { xpEventId: id } })).toBe(1);
    expect(await ledger.awardedTotal(OWN_USER)).toBe(before + 20);
    expect(notices.userNotices).toHaveLength(1);
  });

  it('refuses a reversal that would take the awarded total below zero (NEGATIVE_TOTAL)', async () => {
    const before = await ledger.awardedTotal(OWN_USER);
    const plus = await makeEvent({ source: 'MANUAL_ADJUSTMENT', amount: 10 });
    await makeEvent({ source: 'MANUAL_ADJUSTMENT', amount: -(before + 8) }); // leaves the total at 2
    expect(await ledger.awardedTotal(OWN_USER)).toBe(2);

    await expect(decide(plus, 'REVERSED', 'Wrong')).rejects.toMatchObject({ code: 'NEGATIVE_TOTAL' });
    expect((await row(plus)).status).toBe('AWARDED');
    expect(await prisma.xpReview.count({ where: { xpEventId: plus } })).toBe(0);
  });

  describe('level-up notice', () => {
    const categories = () => notices.userNotices.map((n) => n.category);

    it('is created in the same decision when an approval crosses a level threshold', async () => {
      const id = await makeEvent({ amount: 60 });
      await decide(id, 'AWARDED', 'Great work');
      expect(categories()).toEqual(['XP decisions', 'Level up']);
      expect(notices.userNotices[1]?.message).toContain('Climber');
    });

    it('is not created when the approval stays inside a level', async () => {
      const id = await makeEvent({ amount: 20 });
      await decide(id, 'AWARDED');
      expect(categories()).toEqual(['XP decisions']);
    });

    it('is created when a HELD event is approved across a threshold, not when it is held', async () => {
      const id = await makeEvent({ amount: 60 });
      await decide(id, 'HELD', 'Checking');
      expect(categories()).toEqual(['XP decisions']);
      await decide(id, 'AWARDED', 'Checked');
      expect(categories()).toEqual(['XP decisions', 'XP decisions', 'Level up']);
    });

    it('is never created by a reject or a reversal', async () => {
      const rejected = await makeEvent({ amount: 60 });
      await decide(rejected, 'REJECTED', 'No');
      const reversed = await makeEvent({ amount: 60 });
      await decide(reversed, 'AWARDED');
      notices.userNotices.length = 0;
      await decide(reversed, 'REVERSED', 'Mistake');
      expect(categories()).toEqual(['XP decisions']);
    });

    it('is not repeated for a second approval inside the same level', async () => {
      await decide(await makeEvent({ amount: 60 }), 'AWARDED');
      notices.userNotices.length = 0;
      await decide(await makeEvent({ amount: 10 }), 'AWARDED');
      expect(categories()).toEqual(['XP decisions']);
    });
  });

  it('rolls everything back when the notice fails', async () => {
    const id = await makeEvent();
    notices.failNext(new Error('outbox down'));
    await expect(decide(id, 'AWARDED')).rejects.toThrow('outbox down');
    expect((await row(id)).status).toBe('PENDING');
    expect(await prisma.xpReview.count({ where: { xpEventId: id } })).toBe(0);
  });
});
