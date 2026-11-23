import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { createTestPrisma } from '../growth-core/testing/test-db.js';
import { parseDay } from '../growth-core/time/org-time.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// The database's own rules for the engagement tables, tested DIRECTLY: a violating row is
// written straight through Prisma, and the error must NAME the rule that fired. Every rule
// also gets a valid neighbour that must be accepted. Uses its OWN temporary workspace and
// two temporary users; everything is removed afterwards.

describe('engagement database rules (direct)', () => {
  const tag = randomUUID().slice(0, 8);
  const USERS = [`TEDB${tag}A`, `TEDB${tag}B`] as const;
  const PM = 'PM001'; // seeded PM, only used as a foreign-key target
  let prisma: PrismaService;
  let workspaceId: string;

  const refused = (promise: Promise<unknown>, rule: string) => expect(promise).rejects.toThrow(rule);

  const newQuest = (overrides: Record<string, unknown> = {}) =>
    prisma.quest.create({
      data: {
        workspaceId,
        name: 'q',
        description: 'q',
        target: 3,
        reward: 10,
        startDate: parseDay('2031-06-02'),
        endDate: parseDay('2031-06-08'),
        createdById: PM,
        ...overrides,
      } as never,
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'Engagement DB rules test', slug: `t-edbr-${tag}` } })).id;
    for (const userId of USERS) {
      await prisma.user.create({
        data: {
          userId,
          workspaceId,
          email: `${userId.toLowerCase()}@edb-test.invalid`,
          name: 'DB rules test user',
          resource: 'TRAINEE',
          pmId: PM,
          position: 'BACKEND',
          attendanceMode: 'ONLINE',
          onboardDate: parseDay('2031-01-01'),
        },
      });
    }
  });

  afterAll(async () => {
    const where = { workspaceId };
    await prisma.questProgress.deleteMany({ where });
    await prisma.quest.deleteMany({ where });
    await prisma.kudos.deleteMany({ where });
    await prisma.leaderboardPreference.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('chk_kudos_self: kudos to oneself is refused, kudos to someone else is allowed', async () => {
    const kudos = (fromUserId: string, toUserId: string) =>
      prisma.kudos.create({ data: { workspaceId, fromUserId, toUserId, category: 'HELPFUL', message: 'x', sentOn: parseDay('2031-06-02') } });
    await refused(kudos(USERS[0], USERS[0]), 'chk_kudos_self');
    expect(await kudos(USERS[0], USERS[1])).toMatchObject({ fromUserId: USERS[0], toUserId: USERS[1] });
  });

  it('chk_quest_target: a target below 1 is refused, 1 is allowed', async () => {
    await refused(newQuest({ target: 0 }), 'chk_quest_target');
    await refused(newQuest({ target: -3 }), 'chk_quest_target');
    expect(await newQuest({ target: 1 })).toMatchObject({ target: 1 });
  });

  it('chk_quest_dates: an end date before the start is refused, the same day is allowed', async () => {
    await refused(newQuest({ startDate: parseDay('2031-06-09'), endDate: parseDay('2031-06-08') }), 'chk_quest_dates');
    const sameDay = await newQuest({ startDate: parseDay('2031-06-09'), endDate: parseDay('2031-06-09') });
    expect(sameDay.endDate.toISOString()).toBe(sameDay.startDate.toISOString());
  });

  it('QuestProgress_questId_userId_key: one progress row per quest and user, another user is allowed', async () => {
    const quest = await newQuest();
    const progress = (userId: string) => prisma.questProgress.create({ data: { workspaceId, questId: quest.id, userId } });
    await progress(USERS[0]);
    await refused(progress(USERS[0]), 'QuestProgress_questId_userId_key');
    await progress(USERS[1]);
  });

  it('LeaderboardPreference_userId_key: one preference row per user', async () => {
    await prisma.leaderboardPreference.create({ data: { workspaceId, userId: USERS[0], hidden: true } });
    await refused(prisma.leaderboardPreference.create({ data: { workspaceId, userId: USERS[0] } }), 'LeaderboardPreference_userId_key');
    await prisma.leaderboardPreference.create({ data: { workspaceId, userId: USERS[1] } });
  });
});
