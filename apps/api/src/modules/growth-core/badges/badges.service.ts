import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthError } from '../errors.js';
import { lockUser } from '../locks.js';
import { KUDOS, type KudosPort } from '../ports/kudos.port.js';
import { NOTIFICATIONS, type NotificationPort } from '../ports/notification.port.js';
import type { Tx } from '../ports/db.js';
import { StreakService } from '../streak/streak.service.js';
import { CLOCK, type ClockPort } from '../time/clock.port.js';
import { orgToday, type DayString } from '../time/org-time.js';
import { autoEvidence, ruleMet, validateNewBadge, type BadgeMeasures, type NewBadgeInput } from './badge-rules.js';

export interface CreateBadgeInput extends NewBadgeInput {
  workspaceId: string;
  /** The creating PM, from the session. Also stored as `awardedById` on automatic awards. */
  pmId: string;
}

export interface AwardSpecialInput {
  workspaceId: string;
  badgeId: string;
  userId: string;
  pmId: string;
  evidence: string;
}

export interface RevokeInput {
  workspaceId: string;
  awardId: string;
  pmId: string;
  reason: string;
}

export interface EvaluateResult {
  /** Badge ids newly awarded (or re-earned) by this call. */
  awarded: string[];
  /** Badge ids the system revoked by this call (kudos badges only). */
  revoked: string[];
}

const STREAK_RULES = ['SPRINT_STREAK', 'ON_TIME_SPRINT_STREAK'];
const SYSTEM_REVOKE_REASON = 'Automatic: the approved kudos behind this badge were reversed or rejected.';

/**
 * Badges. Special badges are awarded by a PM with evidence; Behavioral badges are awarded
 * automatically when a rule is met. A badge is earned once per user (one row, ever): a revoke
 * marks the row, and a re-award clears the revoke on the SAME row. Badges give no XP.
 * Every change and its notice happen in one transaction, under the per-user lock.
 */
@Injectable()
export class BadgesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationPort,
    @Inject(StreakService) private readonly streaks: StreakService,
    @Inject(KUDOS) private readonly kudos: KudosPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * A PM creates a badge. A Behavioral badge is then checked for every existing user, so people
   * who already meet the rule get it (each user in their own transaction).
   */
  async create(input: CreateBadgeInput): Promise<{ badgeId: string; awarded: number }> {
    const badge = validateNewBadge(input);
    const { count } = await this.prisma.badge.createMany({
      data: [{ workspaceId: input.workspaceId, createdById: input.pmId, ...badge }],
      skipDuplicates: true,
    });
    if (count === 0) {
      throw new GrowthError('NAME_TAKEN', `A badge named "${badge.name}" already exists`);
    }
    const created = await this.prisma.badge.findUniqueOrThrow({
      where: { workspaceId_name: { workspaceId: input.workspaceId, name: badge.name } },
      select: { id: true },
    });
    const awarded = badge.kind === 'BEHAVIORAL' ? await this.evaluateBadgeForAll(input.workspaceId, created.id) : 0;
    return { badgeId: created.id, awarded };
  }

  /** A retired badge cannot be awarded and is no longer evaluated. Existing awards stay. */
  async retire(input: { workspaceId: string; badgeId: string; pmId: string }): Promise<void> {
    const { count } = await this.prisma.badge.updateMany({
      where: { id: input.badgeId, workspaceId: input.workspaceId, retiredAt: null },
      data: { retiredAt: this.clock.now(), retiredById: input.pmId },
    });
    if (count === 1) {
      return;
    }
    const exists = await this.prisma.badge.findFirst({
      where: { id: input.badgeId, workspaceId: input.workspaceId },
      select: { id: true },
    });
    throw exists
      ? new GrowthError('ALREADY_RETIRED', 'This badge is already retired')
      : new GrowthError('NOT_FOUND', 'Badge not found');
  }

  /** A PM awards a Special badge to a user in their scope, with evidence. Once per user. */
  async awardSpecial(input: AwardSpecialInput): Promise<{ awardId: string }> {
    const evidence = input.evidence.trim();
    if (evidence === '') {
      throw new GrowthError('EVIDENCE_REQUIRED', 'Evidence is required.');
    }
    return this.prisma.$transaction(async (tx) => {
      const badge = await tx.badge.findFirst({
        where: { id: input.badgeId, workspaceId: input.workspaceId },
        select: { id: true, name: true, kind: true, retiredAt: true },
      });
      if (!badge) {
        throw new GrowthError('NOT_FOUND', 'Badge not found');
      }
      if (badge.kind !== 'SPECIAL') {
        throw new GrowthError('NOT_SPECIAL', 'Behavioral badges are awarded automatically');
      }
      if (badge.retiredAt) {
        throw new GrowthError('BADGE_RETIRED', 'This badge is retired');
      }
      const user = await tx.user.findFirst({
        where: { userId: input.userId, workspaceId: input.workspaceId },
        select: { userId: true, pmId: true },
      });
      if (!user) {
        throw new GrowthError('NOT_FOUND', 'User not found');
      }
      if (user.pmId !== input.pmId) {
        throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
      }
      await lockUser(tx, user.userId);

      const existing = await tx.badgeAward.findUnique({
        where: { badgeId_userId: { badgeId: badge.id, userId: user.userId } },
        select: { id: true, revokedAt: true },
      });
      if (existing && !existing.revokedAt) {
        throw new GrowthError('ALREADY_AWARDED', 'This user already has this badge');
      }
      const fields = {
        source: 'MANUAL' as const,
        evidence,
        awardedById: input.pmId,
        awardedAt: this.clock.now(),
        revokedAt: null,
        revokedById: null,
        revokeReason: null,
      };
      const award = existing
        ? await tx.badgeAward.update({ where: { id: existing.id }, data: fields, select: { id: true } })
        : await tx.badgeAward.create({
            data: { workspaceId: input.workspaceId, badgeId: badge.id, userId: user.userId, ...fields },
            select: { id: true },
          });
      await this.noticeAwarded(tx, input.workspaceId, user.userId, badge.name);
      return { awardId: award.id };
    });
  }

  /** A PM revokes an award with a reason, for a user in their scope. */
  async revoke(input: RevokeInput): Promise<void> {
    const reason = input.reason.trim();
    if (reason === '') {
      throw new GrowthError('REASON_REQUIRED', 'A reason is required.');
    }
    await this.prisma.$transaction(async (tx) => {
      const found = await tx.badgeAward.findFirst({
        where: { id: input.awardId, workspaceId: input.workspaceId },
        select: { userId: true },
      });
      if (!found) {
        throw new GrowthError('NOT_FOUND', 'Badge award not found');
      }
      await lockUser(tx, found.userId);
      const award = await tx.badgeAward.findUniqueOrThrow({
        where: { id: input.awardId },
        select: { id: true, userId: true, revokedAt: true, badge: { select: { name: true } }, user: { select: { pmId: true } } },
      });
      if (award.user.pmId !== input.pmId) {
        throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
      }
      if (award.revokedAt) {
        throw new GrowthError('ALREADY_REVOKED', 'This badge was already revoked');
      }
      await tx.badgeAward.update({
        where: { id: award.id },
        data: { revokedAt: this.clock.now(), revokedById: input.pmId, revokeReason: reason },
      });
      await this.noticeRevoked(tx, input.workspaceId, award.userId, award.badge.name, reason);
    });
  }

  /**
   * Checks every active Behavioral badge (or just `badgeId`) for one user. Awards a badge once
   * when its rule is met (source AUTOMATIC, system evidence, awardedById = the PM who created
   * the badge), re-earns a system-revoked kudos badge, and system-revokes a kudos badge whose
   * approved kudos no longer reach the threshold. A badge a PM revoked is never given back.
   * Retired badges are not evaluated.
   */
  async evaluateAuto(
    workspaceId: string,
    userId: string,
    options: { badgeId?: string; asOf?: DayString } = {},
  ): Promise<EvaluateResult> {
    const result: EvaluateResult = { awarded: [], revoked: [] };
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { userId, workspaceId }, select: { userId: true } });
      if (!user) {
        return;
      }
      await lockUser(tx, userId);
      const badges = await tx.badge.findMany({
        where: {
          workspaceId,
          kind: 'BEHAVIORAL',
          retiredAt: null,
          ...(options.badgeId ? { id: options.badgeId } : {}),
        },
      });
      if (badges.length === 0) {
        return;
      }

      const measures: BadgeMeasures = {};
      if (badges.some((b) => STREAK_RULES.includes(b.ruleType))) {
        const asOf = options.asOf ?? orgToday(this.clock.now());
        const streak = await this.streaks.measure(workspaceId, userId, asOf, tx);
        measures.longestStreak = streak.any.longest;
        measures.longestOnTimeStreak = streak.onTime.longest;
      }
      if (badges.some((b) => b.ruleType === 'KUDOS_DISTINCT_SENDERS')) {
        measures.distinctSenders = await this.kudos.distinctApprovedSenders(tx, userId);
      }

      const awards = await tx.badgeAward.findMany({
        where: { userId, badgeId: { in: badges.map((b) => b.id) } },
      });

      for (const badge of badges) {
        const award = awards.find((a) => a.badgeId === badge.id);
        const met = ruleMet(badge.ruleType, badge.threshold, measures);
        if (met) {
          const fields = {
            source: 'AUTOMATIC' as const,
            evidence: autoEvidence(badge.ruleType, badge.threshold as number),
            awardedById: badge.createdById,
            awardedAt: this.clock.now(),
            revokedAt: null,
            revokedById: null,
            revokeReason: null,
          };
          if (!award) {
            await tx.badgeAward.create({ data: { workspaceId, badgeId: badge.id, userId, ...fields } });
          } else if (award.revokedAt && award.revokedById === null) {
            await tx.badgeAward.update({ where: { id: award.id }, data: fields }); // re-earned after a system revoke
          } else {
            continue; // already held, or a PM revoked it: never given back automatically
          }
          await this.noticeAwarded(tx, workspaceId, userId, badge.name);
          result.awarded.push(badge.id);
        } else if (award && !award.revokedAt && badge.ruleType === 'KUDOS_DISTINCT_SENDERS') {
          await tx.badgeAward.update({
            where: { id: award.id },
            data: { revokedAt: this.clock.now(), revokedById: null, revokeReason: SYSTEM_REVOKE_REASON },
          });
          await this.noticeRevoked(tx, workspaceId, userId, badge.name, SYSTEM_REVOKE_REASON);
          result.revoked.push(badge.id);
        }
      }
    });
    return result;
  }

  /** Checks one badge for every active user: used when a Behavioral badge is created. */
  async evaluateBadgeForAll(workspaceId: string, badgeId: string): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { workspaceId, archivedAt: null },
      select: { userId: true },
    });
    let awarded = 0;
    for (const { userId } of users) {
      awarded += (await this.evaluateAuto(workspaceId, userId, { badgeId })).awarded.length;
    }
    return awarded;
  }

  private noticeAwarded(tx: Tx, workspaceId: string, userId: string, badgeName: string): Promise<void> {
    return this.notifications.notifyUser(tx, {
      workspaceId,
      userId,
      category: 'New badge',
      title: 'New badge',
      message: `You earned the "${badgeName}" badge.`,
    });
  }

  private noticeRevoked(tx: Tx, workspaceId: string, userId: string, badgeName: string, reason: string): Promise<void> {
    return this.notifications.notifyUser(tx, {
      workspaceId,
      userId,
      category: 'Badge revoked',
      title: 'Badge revoked',
      message: `Your "${badgeName}" badge was revoked: ${reason}`,
    });
  }
}
