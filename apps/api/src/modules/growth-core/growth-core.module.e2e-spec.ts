import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { validateEnv } from '../../config/env.validation.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GrowthCoreModule } from './growth-core.module.js';
import { BadgesService } from './badges/badges.service.js';
import { LevelsService } from './levels/levels.service.js';
import { LEVELS } from './ports/levels.port.js';
import { StreakService } from './streak/streak.service.js';
import { ensureTestJwtSecrets } from './testing/test-env.js';
import { loadSeed } from './testing/test-db.js';
import { RewardService } from './xp/reward.service.js';
import { XpAdjustmentService } from './xp/xp-adjustment.service.js';
import { XpLedgerService } from './xp/xp-ledger.service.js';
import { XpReviewService } from './xp/xp-review.service.js';

// Proves the Nest wiring works with the real database: GrowthCoreModule builds, the services
// resolve their dependencies, and a reported sprint becomes one pending XP event.
// Run: pnpm --filter api test:e2e (needs infra:up, db:deploy, db:seed).

ensureTestJwtSecrets(); // the module imports E01's IdentityModule, which needs JWT secrets to start

describe('GrowthCoreModule (wired, real database)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let reward: RewardService;
  let ledger: XpLedgerService;
  let workspaceId: string;
  let userId: string;
  const dayKey = '2031-06-02';
  const runTag = `[test:${randomUUID()}]`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, GrowthCoreModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    reward = moduleRef.get(RewardService);
    ledger = moduleRef.get(XpLedgerService);
    const seed = await loadSeed(prisma);
    workspaceId = seed.workspaceId;
    // A user no other spec file touches with AWARDED events: files run in parallel and this
    // spec compares an awarded total before and after.
    userId = seed.users[1] as string;
  });

  afterEach(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId, key: `sprint:${userId}:${dayKey}` } });
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('turns an on-time sprint into one pending event, once, using the seeded rule', async () => {
    const submittedAt = new Date(`${dayKey}T03:30:00Z`); // 09:30 Dhaka, before the 10:00 cutoff
    const first = await reward.recordSprint({ workspaceId, userId, submittedAt });
    const again = await reward.recordSprint({ workspaceId, userId, submittedAt });

    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, eventId: first.eventId });

    const rows = await prisma.xpEvent.findMany({ where: { workspaceId, key: `sprint:${userId}:${dayKey}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'ON_TIME_SPRINT', status: 'PENDING', amount: 20, userId });
    expect(runTag).toContain('[test:'); // the cleanup above is by key, so no stray rows remain
  });

  it('resolves the adjustment and review services with their dependencies', () => {
    expect(moduleRef.get(XpAdjustmentService)).toBeInstanceOf(XpAdjustmentService);
    expect(moduleRef.get(XpReviewService)).toBeInstanceOf(XpReviewService);
    expect(moduleRef.get(LEVELS)).toBeInstanceOf(LevelsService); // the IF-02 token points at the real service
    expect(moduleRef.get(StreakService)).toBeInstanceOf(StreakService);
    expect(moduleRef.get(BadgesService)).toBeInstanceOf(BadgesService);
  });

  it('creates nothing for a late sprint', async () => {
    const result = await reward.recordSprint({ workspaceId, userId, submittedAt: new Date(`${dayKey}T04:00:00Z`) });
    expect(result).toMatchObject({ created: false, skipped: 'LATE' });
    expect(await prisma.xpEvent.count({ where: { workspaceId, key: `sprint:${userId}:${dayKey}` } })).toBe(0);
  });

  it('creates nothing for a user that does not exist', async () => {
    const result = await reward.recordSprint({ workspaceId, userId: 'BS99999', submittedAt: new Date(`${dayKey}T03:00:00Z`) });
    expect(result.skipped).toBe('UNKNOWN_USER');
  });

  it('a pending sprint does not count toward the awarded total', async () => {
    const before = await ledger.awardedTotal(userId);
    await reward.recordSprint({ workspaceId, userId, submittedAt: new Date(`${dayKey}T03:30:00Z`) });
    expect(await ledger.awardedTotal(userId)).toBe(before);
  });
});
