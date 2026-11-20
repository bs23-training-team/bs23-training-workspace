import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { validateEnv } from '../../config/env.validation.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { GrowthCoreModule } from './growth-core.module.js';
import { loadSeed } from './testing/test-db.js';
import { RewardService } from './xp/reward.service.js';
import { XpLedgerService } from './xp/xp-ledger.service.js';

// Proves the Nest wiring works with the real database: GrowthCoreModule builds, the services
// resolve their dependencies, and a reported sprint becomes one pending XP event.
// Run: pnpm --filter api test:e2e (needs infra:up, db:deploy, db:seed).

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
    userId = seed.users[0] as string;
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
