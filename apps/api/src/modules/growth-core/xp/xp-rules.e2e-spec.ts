import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { createTestPrisma } from '../testing/test-db.js';
import { parseDay } from '../time/org-time.js';
import { RewardService } from './reward.service.js';
import { PrismaUserDirectory } from './prisma-user-directory.js';
import { XpLedgerService } from './xp-ledger.service.js';
import { XpRulesService } from './xp-rules.service.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// Editing rules changes a whole workspace, so this file uses its OWN temporary workspace with
// its own XpRule row and one temporary user, never the seeded workspace. All removed afterwards.

describe('XpRulesService update (database)', () => {
  const tag = randomUUID().slice(0, 8);
  const USER = `TRULE${tag}`;
  let prisma: PrismaService;
  let rules: XpRulesService;
  let workspaceId: string;

  beforeAll(async () => {
    prisma = createTestPrisma();
    rules = new XpRulesService(prisma);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Rules test', slug: `t-rules-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } }); // column defaults
    await prisma.user.create({
      data: {
        userId: USER,
        workspaceId,
        email: `${USER.toLowerCase()}@rules-test.invalid`,
        name: 'Rules test user',
        resource: 'TRAINEE',
        pmId: 'PM001',
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2031-01-01'),
      },
    });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  it('reads every rule with the defaults', async () => {
    const all = await rules.getAll(workspaceId);
    expect(all).toMatchObject({
      onTimeSprint: 20,
      verifiedModule: 10,
      finalAssessment: 40,
      kudos: 5,
      pmReviewMultiplier: 1,
      sprintCutoff: '10:00',
      updatedById: null,
    });
  });

  it('saves an edit, records the PM, and leaves the other rules alone', async () => {
    const after = await rules.update(workspaceId, 'PM001', { onTimeSprint: 35, pmReviewMultiplier: 1.5, sprintCutoff: '09:30' });
    expect(after).toMatchObject({ onTimeSprint: 35, pmReviewMultiplier: 1.5, sprintCutoff: '09:30', updatedById: 'PM001', kudos: 5 });
    expect(await rules.getAll(workspaceId)).toEqual(after);
    expect(await rules.get(workspaceId)).toMatchObject({ onTimeSprint: 35, sprintCutoff: '09:30' });
  });

  it('refuses a bad edit (VALIDATION) and changes nothing', async () => {
    const before = await rules.getAll(workspaceId);
    await expect(rules.update(workspaceId, 'PM001', { onTimeSprint: -5, kudos: 9 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(rules.update(workspaceId, 'PM001', { sprintCutoff: '25:00' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await rules.getAll(workspaceId)).toEqual(before);
  });

  it('returns NO_RULE for a workspace without a rules row', async () => {
    await expect(rules.update(randomUUID(), 'PM001', { kudos: 1 })).rejects.toMatchObject({ code: 'NO_RULE' });
    await expect(rules.getAll(randomUUID())).rejects.toMatchObject({ code: 'NO_RULE' });
  });

  it('a new amount only applies to FUTURE events: the earlier event keeps its amount', async () => {
    const ledger = new XpLedgerService(prisma);
    const reward = new RewardService(ledger, rules, new PrismaUserDirectory(prisma));
    await rules.update(workspaceId, 'PM001', { onTimeSprint: 20, sprintCutoff: '10:00' });
    await reward.recordSprint({ workspaceId, userId: USER, submittedAt: new Date('2031-09-01T03:00:00Z') }); // 09:00 Dhaka
    await rules.update(workspaceId, 'PM001', { onTimeSprint: 50 });
    await reward.recordSprint({ workspaceId, userId: USER, submittedAt: new Date('2031-09-02T03:00:00Z') });

    const events = await prisma.xpEvent.findMany({ where: { workspaceId, userId: USER }, orderBy: { occurredOn: 'asc' } });
    expect(events.map((e) => e.amount)).toEqual([20, 50]);
  });

  it('changing the five unenforced rules has no effect on any event', async () => {
    const ledger = new XpLedgerService(prisma);
    const reward = new RewardService(ledger, rules, new PrismaUserDirectory(prisma));
    await rules.update(workspaceId, 'PM001', { onTimeSprint: 20 });
    await rules.update(workspaceId, 'PM001', {
      pmReviewMultiplier: 3,
      engagementDropAlertPct: 5,
      verifiedModuleDailyCap: 0,
      streakMilestone: 999,
      streakMilestoneDays: 1,
    });
    const before = await prisma.xpEvent.count({ where: { workspaceId } });
    const out = await reward.recordSprint({ workspaceId, userId: USER, submittedAt: new Date('2031-09-03T03:00:00Z') });
    const row = await prisma.xpEvent.findUniqueOrThrow({ where: { id: out.eventId as string } });
    expect(row.amount).toBe(20); // not multiplied, not capped, no streak XP
    expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(before + 1);
  });
});
