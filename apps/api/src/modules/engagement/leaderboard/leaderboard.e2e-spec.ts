import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { LevelsService } from '../../growth-core/levels/levels.service.js';
import { FakeNotificationPort } from '../../growth-core/testing/fake-notification-port.js';
import { createTestPrisma } from '../../growth-core/testing/test-db.js';
import { parseDay } from '../../growth-core/time/org-time.js';
import { XpLedgerService } from '../../growth-core/xp/xp-ledger.service.js';
import { manualKey } from '../../growth-core/xp/xp-keys.js';
import { LeaderboardPreferenceService } from './leaderboard-preference.service.js';
import { LeaderboardService, type LeaderboardPage, type Viewer } from './leaderboard.service.js';
import type { LeaderboardWindow } from './leaderboard-rank.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Own temporary workspace with its own levels (Rookie 0, Builder 50), users and XP; removed afterwards.
// "Today" is Wednesday 2026-11-18. This week's Monday is 2026-11-16. Group PM001: A..D + ARCH (archived).
// Group PM002: P.

describe('LeaderboardService (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const id = (n: string) => `TL${n}${tag}`;
  const [A, B, C, D, P, ARCH] = ['A', 'B', 'C', 'D', 'P', 'AR'].map(id) as [string, string, string, string, string, string];
  const NAME = (u: string) => `Name ${u}`;

  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let board: LeaderboardService;
  let prefs: LeaderboardPreferenceService;
  let workspaceId: string;

  const xp = (userId: string, amount: number, day: string, status: 'AWARDED' | 'PENDING' | 'HELD' | 'REJECTED' | 'REVERSED' = 'AWARDED') =>
    ledger.createEvent({
      workspaceId,
      userId,
      source: 'MANUAL_ADJUSTMENT',
      amount,
      key: manualKey(randomUUID()),
      evidence: 'test xp',
      occurredOn: parseDay(day),
      status,
    });
  const get = (viewer: Viewer, window: LeaderboardWindow = 'all', extra: { cursor?: string | null; limit?: number } = {}) =>
    board.get({ workspaceId, viewer, window, ...extra });
  const asUser = (userId: string): Viewer => ({ role: 'USER', userId });
  const makeUser = (userId: string, pmId: string, archivedAt: Date | null = null) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@board-test.invalid`,
        name: NAME(userId),
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        archivedAt,
      },
    });
  const rowsOf = (page: LeaderboardPage) => page.rows as unknown as Record<string, unknown>[];

  beforeAll(async () => {
    prisma = createTestPrisma();
    ledger = new XpLedgerService(prisma);
    const levels = new LevelsService(prisma, new FakeNotificationPort());
    board = new LeaderboardService(prisma, ledger, levels, { now: () => new Date('2026-11-18T06:00:00Z') });
    prefs = new LeaderboardPreferenceService(prisma);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Board test', slug: `t-board-${tag}` } })).id;
    await levels.save(workspaceId, [{ name: 'Rookie', minXp: 0 }, { name: 'Builder', minXp: 50 }]);
    for (const u of [A, B, C, D]) await makeUser(u, 'PM001');
    await makeUser(P, 'PM002');
    await makeUser(ARCH, 'PM001', new Date('2026-06-01T00:00:00Z'));
  });

  afterEach(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.leaderboardPreference.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.leaderboardPreference.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('ranking', () => {
    it('ranks by AWARDED XP only; pending, held, rejected and reversed never count', async () => {
      await xp(A, 30, '2026-11-17');
      await xp(B, 20, '2026-11-17');
      await xp(B, 500, '2026-11-17', 'PENDING');
      await xp(C, 500, '2026-11-17', 'HELD');
      await xp(C, 500, '2026-11-17', 'REJECTED');
      await xp(D, 500, '2026-11-17', 'REVERSED');
      const page = await get({ role: 'PM', pmId: 'PM001' });
      expect(page.rows.map((r) => [(r as { userId: string }).userId, (r as { xp: number }).xp, (r as { rank: number }).rank])).toEqual([
        [A, 30, 1],
        [B, 20, 2],
        [C, 0, 3],
        [D, 0, 3], // a tie, and a user with 0 XP is still ranked
      ]);
    });

    it('a reversed event drops out at once and the rank moves', async () => {
      await xp(A, 30, '2026-11-17');
      const big = await xp(B, 90, '2026-11-17');
      expect(rowsOf(await get({ role: 'PM', pmId: 'PM001' }))[0]).toMatchObject({ userId: B, rank: 1 });
      await prisma.xpEvent.update({ where: { id: big.event.id }, data: { status: 'REVERSED' } });
      expect(rowsOf(await get({ role: 'PM', pmId: 'PM001' }))[0]).toMatchObject({ userId: A, rank: 1 });
    });

    it('ties share a rank: 1, 2, 2, 4', async () => {
      await xp(A, 80, '2026-11-17');
      await xp(B, 50, '2026-11-17');
      await xp(C, 50, '2026-11-17');
      await xp(D, 10, '2026-11-17');
      const ranks = (await get({ role: 'PM', pmId: 'PM001' })).rows.map((r) => (r as { rank: number }).rank);
      expect(ranks).toEqual([1, 2, 2, 4]);
    });
  });

  describe('windows', () => {
    beforeEach(async () => {
      await xp(A, 1, '2026-11-15'); // last Sunday: before this week
      await xp(A, 2, '2026-11-16'); // this Monday
      await xp(A, 4, '2026-11-18'); // today
      await xp(A, 8, '2026-10-20'); // 29 days ago: inside the 30 days
      await xp(A, 16, '2026-10-19'); // 30 days ago: outside
    });
    const xpOfA = async (window: LeaderboardWindow) =>
      (rowsOf(await get({ role: 'PM', pmId: 'PM001' }, window)).find((r) => r.userId === A) as { xp: number }).xp;

    it('weekly counts from this week\'s Monday to today', async () => expect(await xpOfA('weekly')).toBe(6));
    it('monthly counts the last 30 days including today', async () => expect(await xpOfA('monthly')).toBe(1 + 2 + 4 + 8));
    it('all counts everything', async () => expect(await xpOfA('all')).toBe(31));

    it('the level always comes from ALL-TIME XP, even on the weekly board', async () => {
      // A has 31 all-time XP (Rookie, threshold 50). Add 30 more long ago: 61 all-time = Builder, only 6 this week.
      await xp(A, 30, '2026-01-10');
      const row = rowsOf(await get({ role: 'PM', pmId: 'PM001' }, 'weekly')).find((r) => r.userId === A);
      expect(row).toMatchObject({ xp: 6, level: 'Builder' });
    });
  });

  describe('scope', () => {
    it('shows only the viewer\'s PM group: other groups never appear and never shift ranks; archived users are not listed', async () => {
      await xp(P, 999, '2026-11-17'); // PM002's user is far ahead, but in another group
      await xp(ARCH, 999, '2026-11-17');
      await xp(A, 10, '2026-11-17');
      const forUser = await get(asUser(A));
      expect(forUser.rows).toHaveLength(4); // A, B, C, D
      expect(rowsOf(forUser)[0]).toMatchObject({ rank: 1, name: 'You', xp: 10 });
      const forOtherGroup = await get(asUser(P));
      expect(forOtherGroup.rows).toHaveLength(1);
      expect(JSON.stringify(forUser)).not.toContain(NAME(P));
      expect(JSON.stringify(forUser)).not.toContain(NAME(ARCH));
    });

    it('refuses an unknown or archived viewer (NOT_FOUND)', async () => {
      await expect(get(asUser('BS99999'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(get(asUser(ARCH))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('refuses an unknown window (VALIDATION)', async () => {
      await expect(get(asUser(A), 'yearly' as never)).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('opt-out', () => {
    it('a hidden user is "Hidden user" to peers with their XP and rank kept, "You" to themself, and named to the PM', async () => {
      await xp(A, 60, '2026-11-17');
      await xp(B, 40, '2026-11-17');
      await xp(C, 20, '2026-11-17');
      await prefs.set(workspaceId, B, true);

      const peer = rowsOf(await get(asUser(C)));
      expect(peer).toEqual([
        { rank: 1, name: NAME(A), xp: 60, level: 'Builder' },
        { rank: 2, name: 'Hidden user', xp: 40 }, // rank and XP kept: ranks do not shift
        { rank: 3, name: 'You', xp: 20, level: 'Rookie', isYou: true },
        { rank: 4, name: expect.stringContaining('Name'), xp: 0, level: 'Rookie' },
      ]);

      expect(rowsOf(await get(asUser(B)))[1]).toEqual({ rank: 2, name: 'You', xp: 40, level: 'Rookie', isYou: true });

      const pm = rowsOf(await get({ role: 'PM', pmId: 'PM001' }));
      expect(pm.find((r) => r.userId === B)).toMatchObject({ name: NAME(B), hiddenFromPeers: true, rank: 2 });
    });

    it('PRIVACY: the whole response for a peer contains no trace of the hidden user, nor any user id or email', async () => {
      await xp(B, 40, '2026-11-17');
      await prefs.set(workspaceId, B, true);
      const payload = JSON.stringify(await get(asUser(C)));
      expect(payload).not.toContain(B);
      expect(payload).not.toContain(NAME(B));
      expect(payload).not.toContain('@board-test.invalid');
      expect(payload).not.toContain('userId');
      expect(payload).not.toContain('PM001');
      expect(payload).toContain('Hidden user');
    });

    it('opting back in shows the user again at once, and ranks stay the same through the whole change', async () => {
      await xp(B, 40, '2026-11-17');
      await prefs.set(workspaceId, B, true);
      const before = rowsOf(await get(asUser(C))).map((r) => r.rank);
      await prefs.set(workspaceId, B, false);
      const after = rowsOf(await get(asUser(C)));
      expect(after.map((r) => r.rank)).toEqual(before);
      expect(after[0]).toMatchObject({ name: NAME(B), xp: 40 });
    });

    it('only the user can change their setting: an unknown user or a PM id is refused (NOT_FOUND)', async () => {
      await expect(prefs.set(workspaceId, 'BS99999', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(prefs.set(workspaceId, 'PM001', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(prefs.set(workspaceId, ARCH, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(await prefs.get(workspaceId, A)).toEqual({ hidden: false });
    });

    it('saves one preference row per user however many times it is set', async () => {
      await prefs.set(workspaceId, A, true);
      await Promise.all([prefs.set(workspaceId, A, false), prefs.set(workspaceId, A, true), prefs.set(workspaceId, A, false)]);
      expect(await prisma.leaderboardPreference.count({ where: { userId: A } })).toBe(1);
    });
  });

  describe('paging', () => {
    it('returns pages with a cursor and no cursor on the last page', async () => {
      await xp(A, 40, '2026-11-17');
      await xp(B, 30, '2026-11-17');
      await xp(C, 20, '2026-11-17');
      await xp(D, 10, '2026-11-17');
      const first = await get({ role: 'PM', pmId: 'PM001' }, 'all', { limit: 3 });
      expect(first.rows).toHaveLength(3);
      expect(first.nextCursor).toBe('3');
      const second = await get({ role: 'PM', pmId: 'PM001' }, 'all', { limit: 3, cursor: first.nextCursor });
      expect(second.rows).toHaveLength(1);
      expect(second.nextCursor).toBeNull();
      expect(rowsOf(second)[0]).toMatchObject({ userId: D, rank: 4 }); // rank is the whole-board rank, not the page's
    });
  });
});
