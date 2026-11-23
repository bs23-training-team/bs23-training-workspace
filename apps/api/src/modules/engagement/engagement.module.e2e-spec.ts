import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { validateEnv } from '../../config/env.validation.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureTestJwtSecrets } from '../growth-core/testing/test-env.js';
import { BadgesService } from '../growth-core/badges/badges.service.js';
import { CLOCK, KUDOS } from '../growth-core/index.js';
import { parseDay } from '../growth-core/time/org-time.js';
import { XpReviewService } from '../growth-core/xp/xp-review.service.js';
import { EngagementModule } from './engagement.module.js';
import { KudosQueryService } from './kudos/kudos-query.service.js';
import { LeaderboardPreferenceService } from './leaderboard/leaderboard-preference.service.js';
import { LeaderboardService } from './leaderboard/leaderboard.service.js';
import { QuestsService } from './quests/quests.service.js';
import { KudosService } from './kudos/kudos.service.js';

// The real Nest wiring of both modules with the real database: engagement sends kudos through
// growth-core's ledger, a PM approves the XP, and growth-core's kudos badge rule reads kudos
// back through engagement's IF-04 reader. Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace; removed afterwards.

ensureTestJwtSecrets(); // growth-core imports E01's IdentityModule, which needs JWT secrets to start

describe('EngagementModule + GrowthCoreModule (wired, real database)', () => {
  const tag = randomUUID().slice(0, 6);
  const [R, S1, S2, S3] = [`TW0${tag}`, `TW1${tag}`, `TW2${tag}`, `TW3${tag}`];
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let kudos: KudosService;
  let review: XpReviewService;
  let badges: BadgesService;
  let workspaceId: string;

  const decide = (kudosId: string, toStatus: 'AWARDED' | 'REVERSED' | 'REJECTED') =>
    prisma.xpEvent
      .findUniqueOrThrow({ where: { workspaceId_key: { workspaceId, key: `kudos:${kudosId}` } } })
      .then((event) => review.decide({ workspaceId, eventId: event.id, pmId: 'PM001', toStatus, reason: 'Checked' }));

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, EngagementModule],
    })
      .overrideProvider(CLOCK)
      .useValue({ now: () => new Date('2026-11-16T06:00:00Z') }) // Monday noon in Dhaka
      .compile();
    prisma = moduleRef.get(PrismaService);
    kudos = moduleRef.get(KudosService);
    badges = moduleRef.get(BadgesService, { strict: false });
    review = moduleRef.get(XpReviewService, { strict: false });

    workspaceId = (await prisma.workspace.create({ data: { name: 'Wiring test', slug: `t-wire-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    for (const userId of [R, S1, S2, S3]) {
      await prisma.user.create({
        data: {
          userId,
          workspaceId,
          email: `${userId.toLowerCase()}@wire-test.invalid`,
          name: `Name ${userId}`,
          resource: 'TRAINEE',
          pmId: 'PM001',
          position: 'BACKEND',
          attendanceMode: 'ONLINE',
          onboardDate: parseDay('2026-01-01'),
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.kudos.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await moduleRef.close();
  });

  it('builds, and growth-core\'s KUDOS token is engagement\'s real IF-04 reader (not a stand-in)', () => {
    expect(kudos).toBeInstanceOf(KudosService);
    expect(moduleRef.get(KUDOS, { strict: false })).toBeInstanceOf(KudosQueryService);
  });

  it('resolves the leaderboard, preference and quest services with their dependencies (IF-01, IF-02 through growth-core)', () => {
    expect(moduleRef.get(LeaderboardService)).toBeInstanceOf(LeaderboardService);
    expect(moduleRef.get(LeaderboardPreferenceService)).toBeInstanceOf(LeaderboardPreferenceService);
    expect(moduleRef.get(QuestsService)).toBeInstanceOf(QuestsService);
  });

  it('kudos from three people, approved by the PM, earn the kudos badge; a reversal takes it away', async () => {
    const created = await badges.create({
      workspaceId,
      pmId: 'PM001',
      name: `Well liked ${tag}`,
      icon: '💛',
      kind: 'BEHAVIORAL',
      criteria: 'Kudos from 3 different people',
      ruleType: 'KUDOS_DISTINCT_SENDERS',
      threshold: 3,
    });

    const sent = [];
    for (const sender of [S1, S2, S3]) sent.push(await kudos.send({ workspaceId, fromUserId: sender, toUserId: R, category: 'HELPFUL', message: 'Thanks' }));

    // Pending kudos do not count: the PM has not approved anything yet.
    expect((await badges.evaluateAuto(workspaceId, R)).awarded).toEqual([]);

    await decide(sent[0]!.kudosId, 'AWARDED');
    await decide(sent[1]!.kudosId, 'AWARDED');
    expect((await badges.evaluateAuto(workspaceId, R)).awarded).toEqual([]); // 2 approved senders, need 3

    await decide(sent[2]!.kudosId, 'AWARDED');
    expect((await badges.evaluateAuto(workspaceId, R)).awarded).toEqual([created.badgeId]);
    const award = await prisma.badgeAward.findUniqueOrThrow({ where: { badgeId_userId: { badgeId: created.badgeId, userId: R } } });
    expect(award).toMatchObject({ source: 'AUTOMATIC', revokedAt: null });

    // A reversed kudos is no longer approved: the system revokes the badge (no PM involved).
    await decide(sent[1]!.kudosId, 'REVERSED');
    expect((await badges.evaluateAuto(workspaceId, R)).revoked).toEqual([created.badgeId]);
    expect(await prisma.badgeAward.findUniqueOrThrow({ where: { id: award.id } })).toMatchObject({ revokedById: null });

    // Two approved kudos are left (a reversed event is final, so the badge needs a new approved kudos to return).
    expect(await prisma.xpEvent.count({ where: { userId: R, source: 'KUDOS', status: 'AWARDED' } })).toBe(2);
  });
});
