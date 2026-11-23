import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { FakeNotificationPort } from '../testing/fake-notification-port.js';
import { createTestPrisma } from '../testing/test-db.js';
import { LevelsService } from './levels.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Saving levels changes a whole workspace, so this file makes its OWN temporary workspace
// (never the seeded one) and deletes it afterwards.

const FOUR = [
  { name: 'Rookie', minXp: 0 },
  { name: 'Builder', minXp: 250 },
  { name: 'Pro', minXp: 600 },
  { name: 'Expert', minXp: 1200 },
];

describe('LevelsService (database)', () => {
  let prisma: PrismaService;
  let notices: FakeNotificationPort;
  let levels: LevelsService;
  let workspaceId: string;

  const activeRows = () =>
    prisma.level.findMany({ where: { workspaceId, retiredAt: null }, orderBy: { minXp: 'asc' } });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (
      await prisma.workspace.create({ data: { name: 'Levels test', slug: `t-levels-${randomUUID().slice(0, 8)}` } })
    ).id;
  });

  beforeEach(() => {
    notices = new FakeNotificationPort();
    levels = new LevelsService(prisma, notices);
  });

  afterEach(async () => {
    await prisma.level.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.level.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('saves a first set and returns it lowest threshold first', async () => {
    const saved = await levels.save(workspaceId, [...FOUR]);
    expect(saved.map((l) => [l.name, l.minXp])).toEqual(FOUR.map((l) => [l.name, l.minXp]));
    expect((await levels.active(workspaceId)).map((l) => l.name)).toEqual(['Rookie', 'Builder', 'Pro', 'Expert']);
  });

  it('keeps the rows of unchanged levels and retires only the changed one', async () => {
    const first = await levels.save(workspaceId, FOUR);
    const idOf = (name: string) => first.find((l) => l.name === name)?.id;

    const second = await levels.save(
      workspaceId,
      FOUR.map((l) => (l.name === 'Pro' ? { ...l, minXp: 700 } : l)),
    );

    for (const name of ['Rookie', 'Builder', 'Expert']) {
      expect(second.find((l) => l.name === name)?.id).toBe(idOf(name)); // same row, untouched
    }
    const pro = second.find((l) => l.name === 'Pro');
    expect(pro).toMatchObject({ minXp: 700 });
    expect(pro?.id).not.toBe(idOf('Pro'));

    const oldPro = await prisma.level.findUniqueOrThrow({ where: { id: idOf('Pro') as string } });
    expect(oldPro.retiredAt).not.toBeNull();
    expect(await prisma.level.count({ where: { workspaceId } })).toBe(5); // 4 active + 1 retired
  });

  it('saving the same set again changes nothing', async () => {
    const first = await levels.save(workspaceId, FOUR);
    const again = await levels.save(workspaceId, FOUR);
    expect(again).toEqual(first);
    expect(await prisma.level.count({ where: { workspaceId } })).toBe(4);
  });

  it('can swap two names between thresholds (retire first, so nothing collides)', async () => {
    await levels.save(workspaceId, [{ name: 'A', minXp: 0 }, { name: 'B', minXp: 100 }]);
    const swapped = await levels.save(workspaceId, [{ name: 'B', minXp: 0 }, { name: 'A', minXp: 100 }]);
    expect(swapped.map((l) => [l.name, l.minXp])).toEqual([['B', 0], ['A', 100]]);
  });

  it('refuses an invalid set (LEVEL_FIRST) and changes nothing', async () => {
    await levels.save(workspaceId, FOUR);
    await expect(
      levels.save(workspaceId, [{ name: 'Rookie', minXp: 5 }, { name: 'Builder', minXp: 250 }]),
    ).rejects.toMatchObject({ code: 'LEVEL_FIRST' });
    expect((await activeRows()).map((l) => l.name)).toEqual(['Rookie', 'Builder', 'Pro', 'Expert']);
    expect(await prisma.level.count({ where: { workspaceId } })).toBe(4);
  });

  it('keeps one consistent active set when 3 different saves arrive at once', async () => {
    const sets = [
      [{ name: 'One', minXp: 0 }, { name: 'Two', minXp: 100 }],
      [{ name: 'Alpha', minXp: 0 }, { name: 'Beta', minXp: 50 }, { name: 'Gamma', minXp: 500 }],
      [{ name: 'Low', minXp: 0 }, { name: 'High', minXp: 900 }],
    ];
    const results = await Promise.allSettled(sets.map((s) => levels.save(workspaceId, s)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const active = (await activeRows()).map((l) => [l.name, l.minXp]);
    const matchesOneSet = sets.some((s) => JSON.stringify(s.map((l) => [l.name, l.minXp])) === JSON.stringify(active));
    expect(matchesOneSet).toBe(true); // never a mix of two sets
  });

  it('the database refuses two ACTIVE levels with the same name or threshold, but allows a retired one', async () => {
    await levels.save(workspaceId, [{ name: 'Rookie', minXp: 0 }, { name: 'Builder', minXp: 250 }]);
    await expect(prisma.level.create({ data: { workspaceId, name: 'Rookie', minXp: 999 } })).rejects.toThrow();
    await expect(prisma.level.create({ data: { workspaceId, name: 'Other', minXp: 250 } })).rejects.toThrow();
    await expect(
      prisma.level.create({ data: { workspaceId, name: 'Rookie', minXp: 250, retiredAt: new Date() } }),
    ).resolves.toBeDefined();
  });

  it('finds the level for a total, exactly on a threshold too', async () => {
    await levels.save(workspaceId, FOUR);
    expect((await levels.levelFor(workspaceId, 0))?.name).toBe('Rookie');
    expect((await levels.levelFor(workspaceId, 249))?.name).toBe('Rookie');
    expect((await levels.levelFor(workspaceId, 250))?.name).toBe('Builder');
    expect((await levels.levelFor(workspaceId, 5000))?.name).toBe('Expert');
  });

  describe('level-up notice', () => {
    const notify = (before: number, after: number) =>
      prisma.$transaction((tx) => levels.notifyIfLeveledUp(tx, { workspaceId, userId: 'BS23003', before, after }));

    beforeEach(async () => {
      await levels.save(workspaceId, FOUR);
    });

    it('is created when earned XP crosses a threshold, exactly on it too', async () => {
      expect(await notify(240, 250)).toBe(true);
      expect(notices.userNotices).toHaveLength(1);
      expect(notices.userNotices[0]).toMatchObject({ userId: 'BS23003', category: 'Level up' });
      expect(notices.userNotices[0]?.message).toContain('Builder');
    });

    it('is one notice, for the final level, when several thresholds are crossed', async () => {
      expect(await notify(100, 700)).toBe(true);
      expect(notices.userNotices).toHaveLength(1);
      expect(notices.userNotices[0]?.message).toContain('Pro');
    });

    it('is not created inside a level, or when XP does not rise', async () => {
      expect(await notify(10, 200)).toBe(false);
      expect(await notify(300, 300)).toBe(false);
      expect(await notify(300, 100)).toBe(false); // a drop never levels up
      expect(notices.userNotices).toHaveLength(0);
    });

    it('is never created by saving or editing the levels', async () => {
      await levels.save(workspaceId, FOUR.map((l) => (l.name === 'Builder' ? { ...l, minXp: 100 } : l)));
      expect(notices.userNotices).toHaveLength(0);
    });
  });
});
