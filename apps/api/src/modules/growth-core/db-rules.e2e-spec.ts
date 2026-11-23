import { randomUUID } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { createTestPrisma } from './testing/test-db.js';
import { parseDay } from './time/org-time.js';

// Needs the local database (pnpm infra:up, db:deploy). Run: pnpm --filter api test:e2e
// The database's own rules for the growth-core tables, tested DIRECTLY: a violating row is
// written straight through Prisma, and the error must NAME the rule that fired (a bare
// "something threw" would also pass for an unrelated error). Every rule also gets a valid
// neighbour that must be accepted, so a rule that is too strict fails too.
// Uses its OWN temporary workspace and two temporary users; everything is removed afterwards.

describe('growth-core database rules (direct)', () => {
  const tag = randomUUID().slice(0, 8);
  const USERS = [`TDBR${tag}A`, `TDBR${tag}B`] as const;
  const PM = 'PM001'; // seeded PM, only used as a foreign-key target
  let prisma: PrismaService;
  let workspaceId: string;
  let seq = 0;
  const next = () => `${tag}-${(seq += 1)}`;

  const refused = (promise: Promise<unknown>, rule: string) => expect(promise).rejects.toThrow(rule);

  const newBadge = (overrides: Record<string, unknown> = {}) =>
    prisma.badge.create({
      data: { workspaceId, name: `B-${next()}`, icon: 'x', criteria: 'x', createdById: PM, kind: 'SPECIAL', ruleType: 'MANUAL', ...overrides } as never,
    });
  const newAward = (badgeId: string, userId: string) =>
    prisma.badgeAward.create({ data: { workspaceId, badgeId, userId, source: 'MANUAL', evidence: 'x', awardedById: PM } });
  const newEvent = (overrides: Record<string, unknown> = {}) =>
    prisma.xpEvent.create({
      data: { workspaceId, userId: USERS[0], source: 'MANUAL_ADJUSTMENT', amount: 1, key: `manual:${randomUUID()}`, evidence: 'x', occurredOn: parseDay('2031-06-02'), ...overrides } as never,
    });

  beforeAll(async () => {
    prisma = createTestPrisma();
    workspaceId = (await prisma.workspace.create({ data: { name: 'DB rules test', slug: `t-dbr-${tag}` } })).id;
    for (const userId of USERS) {
      await prisma.user.create({
        data: {
          userId,
          workspaceId,
          email: `${userId.toLowerCase()}@dbr-test.invalid`,
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
    await prisma.badgeAward.deleteMany({ where });
    await prisma.badge.deleteMany({ where });
    await prisma.streakFreeze.deleteMany({ where });
    await prisma.streak.deleteMany({ where });
    await prisma.xpEvent.deleteMany({ where });
    await prisma.level.deleteMany({ where });
    await prisma.xpRule.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.$disconnect();
  });

  describe('XpRule', () => {
    beforeAll(async () => {
      await prisma.xpRule.create({ data: { workspaceId } });
    });

    it('chk_xprule_nonneg: a negative amount is refused, zero is allowed', async () => {
      await refused(prisma.xpRule.update({ where: { workspaceId }, data: { kudos: -1 } }), 'chk_xprule_nonneg');
      await refused(prisma.xpRule.update({ where: { workspaceId }, data: { onTimeSprint: -20 } }), 'chk_xprule_nonneg');
      await refused(prisma.xpRule.update({ where: { workspaceId }, data: { kudosCooldownDays: -1 } }), 'chk_xprule_nonneg');
      await refused(prisma.xpRule.update({ where: { workspaceId }, data: { pmReviewMultiplier: -0.5 } }), 'chk_xprule_nonneg');
      expect(await prisma.xpRule.update({ where: { workspaceId }, data: { kudos: 0 } })).toMatchObject({ kudos: 0 });
      await prisma.xpRule.update({ where: { workspaceId }, data: { kudos: 5 } });
    });

    it('chk_xprule_milestone_days: a streak milestone shorter than 1 day is refused, 1 is allowed', async () => {
      await refused(prisma.xpRule.update({ where: { workspaceId }, data: { streakMilestoneDays: 0 } }), 'chk_xprule_milestone_days');
      expect(await prisma.xpRule.update({ where: { workspaceId }, data: { streakMilestoneDays: 1 } })).toMatchObject({ streakMilestoneDays: 1 });
      await prisma.xpRule.update({ where: { workspaceId }, data: { streakMilestoneDays: 5 } });
    });

    it('XpRule_workspaceId_key: a second rules row for the same workspace is refused', async () => {
      await refused(prisma.xpRule.create({ data: { workspaceId } }), 'XpRule_workspaceId_key');
      expect(await prisma.xpRule.count({ where: { workspaceId } })).toBe(1);
    });
  });

  describe('Level', () => {
    it('chk_level_minxp: a negative threshold is refused, 0 is allowed', async () => {
      await refused(prisma.level.create({ data: { workspaceId, name: `L-${next()}`, minXp: -1 } }), 'chk_level_minxp');
      const ok = await prisma.level.create({ data: { workspaceId, name: `L-${next()}`, minXp: 0, retiredAt: new Date() } });
      expect(ok.minXp).toBe(0);
    });

    it('uq_level_active_name / uq_level_active_minxp: two ACTIVE levels may not share a name or a threshold, a retired one may', async () => {
      const name = `L-${next()}`;
      await prisma.level.create({ data: { workspaceId, name, minXp: 7001 } });
      await refused(prisma.level.create({ data: { workspaceId, name, minXp: 7002 } }), 'uq_level_active_name');
      await refused(prisma.level.create({ data: { workspaceId, name: `L-${next()}`, minXp: 7001 } }), 'uq_level_active_minxp');
      const retired = await prisma.level.create({ data: { workspaceId, name, minXp: 7001, retiredAt: new Date() } });
      expect(retired.retiredAt).not.toBeNull();
    });
  });

  describe('XpEvent', () => {
    it('XpEvent_workspaceId_key_key: the same key twice in a workspace is refused, another key is allowed', async () => {
      const key = `manual:${randomUUID()}`;
      await newEvent({ key });
      await refused(newEvent({ key }), 'XpEvent_workspaceId_key_key');
      await newEvent({ key: `manual:${randomUUID()}` });
      expect(await prisma.xpEvent.count({ where: { workspaceId, key } })).toBe(1);
    });
  });

  describe('Streak and StreakFreeze', () => {
    it('Streak_userId_key: one streak row per user', async () => {
      await prisma.streak.create({ data: { workspaceId, userId: USERS[0] } });
      await refused(prisma.streak.create({ data: { workspaceId, userId: USERS[0] } }), 'Streak_userId_key');
      await prisma.streak.create({ data: { workspaceId, userId: USERS[1] } });
    });

    it('StreakFreeze_userId_date_key: one freeze per user and day, another day or another user is allowed', async () => {
      const base = { workspaceId, source: 'HOLIDAY' as const, reason: 'x', grantedById: PM };
      await prisma.streakFreeze.create({ data: { ...base, userId: USERS[0], date: parseDay('2031-06-04') } });
      await refused(prisma.streakFreeze.create({ data: { ...base, userId: USERS[0], date: parseDay('2031-06-04') } }), 'StreakFreeze_userId_date_key');
      await prisma.streakFreeze.create({ data: { ...base, userId: USERS[0], date: parseDay('2031-06-05') } });
      await prisma.streakFreeze.create({ data: { ...base, userId: USERS[1], date: parseDay('2031-06-04') } });
    });
  });

  describe('Badge', () => {
    it('Badge_workspaceId_name_key: two badges with the same name in a workspace are refused', async () => {
      const name = `B-${next()}`;
      await newBadge({ name });
      await refused(newBadge({ name }), 'Badge_workspaceId_name_key');
    });

    it('chk_badge_kind_rule: Special = manual with no threshold; Behavioral = automatic rule with threshold >= 1', async () => {
      await refused(newBadge({ kind: 'SPECIAL', ruleType: 'MANUAL', threshold: 3 }), 'chk_badge_kind_rule'); // Special with a threshold
      await refused(newBadge({ kind: 'SPECIAL', ruleType: 'SPRINT_STREAK' }), 'chk_badge_kind_rule'); // Special with an automatic rule
      await refused(newBadge({ kind: 'BEHAVIORAL', ruleType: 'MANUAL', threshold: 3 }), 'chk_badge_kind_rule'); // Behavioral but manual
      await refused(newBadge({ kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK' }), 'chk_badge_kind_rule'); // no threshold
      await refused(newBadge({ kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 0 }), 'chk_badge_kind_rule'); // threshold below 1
      expect(await newBadge({ kind: 'SPECIAL', ruleType: 'MANUAL' })).toMatchObject({ kind: 'SPECIAL', threshold: null });
      expect(await newBadge({ kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 1 })).toMatchObject({ threshold: 1 });
    });

    it('chk_badge_retired_pair: retiredAt and retiredById are set together or not at all', async () => {
      await refused(newBadge({ retiredAt: new Date() }), 'chk_badge_retired_pair');
      await refused(newBadge({ retiredById: PM }), 'chk_badge_retired_pair');
      const both = await newBadge({ retiredAt: new Date(), retiredById: PM });
      expect(both.retiredById).toBe(PM);
    });
  });

  describe('BadgeAward', () => {
    it('BadgeAward_badgeId_userId_key: a badge is earned once per user, another user may earn it', async () => {
      const badge = await newBadge();
      await newAward(badge.id, USERS[0]);
      await refused(newAward(badge.id, USERS[0]), 'BadgeAward_badgeId_userId_key');
      await newAward(badge.id, USERS[1]);
    });

    it('chk_badgeaward_revoke_reason: a revoke needs a non-blank reason', async () => {
      const badge = await newBadge();
      const award = await newAward(badge.id, USERS[0]);
      const revoke = (revokeReason: string | null) =>
        prisma.badgeAward.update({ where: { id: award.id }, data: { revokedAt: new Date(), revokedById: PM, revokeReason } });
      await refused(revoke(null), 'chk_badgeaward_revoke_reason');
      await refused(revoke(''), 'chk_badgeaward_revoke_reason');
      await refused(revoke('   '), 'chk_badgeaward_revoke_reason');
      expect(await revoke('given by mistake')).toMatchObject({ revokeReason: 'given by mistake' });
    });
  });
});
