import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { BadgeAwardSource, BadgeKind, BadgeRuleType } from '../../../generated/prisma/enums.js';
import { MAX_PAGE, parseCursor } from '../paging.js';
import { KUDOS, type KudosPort } from '../ports/kudos.port.js';
import { StreakService } from '../streak/streak.service.js';
import { CLOCK, type ClockPort } from '../time/clock.port.js';
import { orgToday } from '../time/org-time.js';
import { pmVisibleUsers } from '../visibility/pm-visible-users.js';
import type { BadgeMeasures } from './badge-rules.js';

export interface BadgeRuleView {
  type: BadgeRuleType;
  threshold: number;
}

interface BadgeBase {
  badgeId: string;
  name: string;
  icon: string;
  kind: BadgeKind;
  criteria: string;
  /** null for a Special badge (a PM awards it). */
  rule: BadgeRuleView | null;
  retiredAt: string | null;
}

/** A user's own award of a badge. The revoke reason is not here: the user gets it in the notice. */
export interface MyBadgeAwardView {
  awardId: string;
  source: BadgeAwardSource;
  awardedAt: string;
  revokedAt: string | null;
}

export interface UserBadgeView extends BadgeBase {
  mine: MyBadgeAwardView | null;
  /** Where the user stands on the rule, in the rule's own unit. null for a Special badge or a badge already held. */
  progress: { value: number; threshold: number } | null;
}

export interface PmBadgeAwardView {
  awardId: string;
  userId: string;
  userName: string;
  /** true when this PM manages the user. Only then may the PM revoke the award (FR-GRW-59). */
  managedByYou: boolean;
  source: BadgeAwardSource;
  awardedAt: string;
  /** The PM who awarded it by hand. null for an automatic award: the UI shows "System". */
  awardedBy: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface PmBadgeView extends BadgeBase {
  awards: PmBadgeAwardView[];
}

export interface PageInput {
  cursor?: string | null;
  limit?: number;
}

/**
 * Reading badges (FR-GRW-41 to 51). A user sees the catalogue with their own award and their progress; a PM sees
 * every badge with who holds it. Read-only: awards and revokes stay in BadgesService.
 */
@Injectable()
export class BadgesQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(StreakService) private readonly streaks: StreakService,
    @Inject(KUDOS) private readonly kudos: KudosPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /** The catalogue for a user: active badges, plus a retired badge the user holds. Oldest badge first. */
  async forUser(workspaceId: string, userId: string, input: PageInput = {}) {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const awards = await this.prisma.badgeAward.findMany({ where: { workspaceId, userId } });
    const held = new Map(awards.map((a) => [a.badgeId, a]));
    const rows = await this.prisma.badge.findMany({
      where: { workspaceId, OR: [{ retiredAt: null }, { id: { in: [...held.keys()] } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const measures = await this.measuresFor(workspaceId, userId, page.filter((b) => !isHeld(held.get(b.id))));

    const badges: UserBadgeView[] = page.map((b) => {
      const award = held.get(b.id);
      return {
        ...baseOf(b),
        mine: award
          ? {
              awardId: award.id,
              source: award.source,
              awardedAt: award.awardedAt.toISOString(),
              revokedAt: award.revokedAt ? award.revokedAt.toISOString() : null,
            }
          : null,
        progress: isHeld(award) ? null : progressOf(b.ruleType, b.threshold, measures),
      };
    });
    return { viewer: 'USER' as const, badges, nextCursor: rows.length > take ? String(skip + take) : null };
  }

  /** The catalogue for a PM: every badge, retired ones too, with the awards of the users the PM can see. */
  async forPm(workspaceId: string, pmId: string, input: PageInput = {}) {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const rows = await this.prisma.badge.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip,
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const awards = await this.prisma.badgeAward.findMany({
      where: { workspaceId, badgeId: { in: page.map((b) => b.id) }, user: pmVisibleUsers(workspaceId) },
      include: { user: { select: { name: true, pmId: true } } },
      orderBy: [{ awardedAt: 'asc' }, { id: 'asc' }],
    });

    const badges: PmBadgeView[] = page.map((b) => ({
      ...baseOf(b),
      awards: awards
        .filter((a) => a.badgeId === b.id)
        .map((a) => ({
          awardId: a.id,
          userId: a.userId,
          userName: a.user.name,
          managedByYou: a.user.pmId === pmId,
          source: a.source,
          awardedAt: a.awardedAt.toISOString(),
          awardedBy: a.source === 'AUTOMATIC' ? null : a.awardedById,
          revokedAt: a.revokedAt ? a.revokedAt.toISOString() : null,
          revokeReason: a.revokeReason,
        })),
    }));
    return { viewer: 'PM' as const, badges, nextCursor: rows.length > take ? String(skip + take) : null };
  }

  /** The numbers the rules read, for one user, only as far as the badges on this page need them. */
  private async measuresFor(
    workspaceId: string,
    userId: string,
    badges: { ruleType: BadgeRuleType }[],
  ): Promise<BadgeMeasures> {
    const measures: BadgeMeasures = {};
    if (badges.some((b) => b.ruleType === 'SPRINT_STREAK' || b.ruleType === 'ON_TIME_SPRINT_STREAK')) {
      const streak = await this.streaks.measure(workspaceId, userId, orgToday(this.clock.now()), this.prisma);
      measures.longestStreak = streak.any.longest;
      measures.longestOnTimeStreak = streak.onTime.longest;
    }
    if (badges.some((b) => b.ruleType === 'KUDOS_DISTINCT_SENDERS')) {
      measures.distinctSenders = await this.kudos.distinctApprovedSenders(this.prisma, userId);
    }
    return measures;
  }
}

/** A badge counts as held while its award is not revoked. */
const isHeld = (award: { revokedAt: Date | null } | undefined): boolean => award !== undefined && award.revokedAt === null;

const baseOf = (b: {
  id: string;
  name: string;
  icon: string;
  kind: BadgeKind;
  criteria: string;
  ruleType: BadgeRuleType;
  threshold: number | null;
  retiredAt: Date | null;
}): BadgeBase => ({
  badgeId: b.id,
  name: b.name,
  icon: b.icon,
  kind: b.kind,
  criteria: b.criteria,
  rule: b.ruleType !== 'MANUAL' && b.threshold !== null ? { type: b.ruleType, threshold: b.threshold } : null,
  retiredAt: b.retiredAt ? b.retiredAt.toISOString() : null,
});

/** The value the rule compares with the threshold: the same measure `ruleMet` uses, so the screen needs no rule of its own. */
function progressOf(ruleType: BadgeRuleType, threshold: number | null, measures: BadgeMeasures) {
  if (ruleType === 'MANUAL' || threshold === null) {
    return null;
  }
  const value =
    ruleType === 'SPRINT_STREAK'
      ? (measures.longestStreak ?? 0)
      : ruleType === 'ON_TIME_SPRINT_STREAK'
        ? (measures.longestOnTimeStreak ?? 0)
        : (measures.distinctSenders ?? 0);
  return { value, threshold };
}
