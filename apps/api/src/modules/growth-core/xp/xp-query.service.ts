import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { XpSource, XpStatus } from '../../../generated/prisma/enums.js';
import { GrowthError } from '../errors.js';
import { MAX_PAGE, parseCursor } from '../paging.js';
import { LEVELS, type LevelsPort } from '../ports/levels.port.js';

export interface XpEventView {
  id: string;
  userId: string;
  source: XpSource;
  amount: number;
  status: XpStatus;
  reason: string | null;
  flag: string | null;
  evidence: string;
  occurredOn: string;
  createdAt: string;
}

/**
 * An XP event as its OWNER sees it. The flag ("Suspicious exchange", "Weekly received cap reached") is a PM's
 * information and is never here; the user sees the status, and the reason once a PM has decided.
 */
export type MyXpEventView = Omit<XpEventView, 'flag'>;

export interface MyGrowth {
  /** XP that counts: AWARDED only. */
  awardedXp: number;
  /** XP waiting for a PM: PENDING and HELD. Shown separately, never added to the total. */
  pendingXp: number;
  level: string | null;
  streak: { current: number; longest: number };
  badges: { badgeId: string; name: string; icon: string; awardedAt: string }[];
}

const toView = (e: {
  id: string;
  userId: string;
  source: XpSource;
  amount: number;
  status: XpStatus;
  reason: string | null;
  flag: string | null;
  evidence: string;
  occurredOn: Date;
  createdAt: Date;
}): XpEventView => ({
  id: e.id,
  userId: e.userId,
  source: e.source,
  amount: e.amount,
  status: e.status,
  reason: e.reason,
  flag: e.flag,
  evidence: e.evidence,
  occurredOn: e.occurredOn.toISOString().slice(0, 10),
  createdAt: e.createdAt.toISOString(),
});

// Field by field, so the flag cannot reach a user through a spread.
const toMyView = (e: Parameters<typeof toView>[0]): MyXpEventView => ({
  id: e.id,
  userId: e.userId,
  source: e.source,
  amount: e.amount,
  status: e.status,
  reason: e.reason,
  evidence: e.evidence,
  occurredOn: e.occurredOn.toISOString().slice(0, 10),
  createdAt: e.createdAt.toISOString(),
});

/**
 * Reading XP for screens. A user sees only their own events (FR-GRW-23); a PM sees the events
 * of their own users, as a paged review queue and history.
 */
@Injectable()
export class XpQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEVELS) private readonly levels: LevelsPort,
  ) {}

  /** The review queue and history for a PM's own users, newest first. */
  async queue(input: {
    workspaceId: string;
    pmId: string;
    status?: XpStatus;
    userId?: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ events: XpEventView[]; nextCursor: string | null }> {
    if (input.userId) {
      const user = await this.prisma.user.findFirst({
        where: { userId: input.userId, workspaceId: input.workspaceId },
        select: { pmId: true },
      });
      if (!user) throw new GrowthError('NOT_FOUND', 'User not found');
      if (user.pmId !== input.pmId) throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
    }
    return this.page(
      { workspaceId: input.workspaceId, user: { pmId: input.pmId }, ...(input.status ? { status: input.status } : {}), ...(input.userId ? { userId: input.userId } : {}) },
      input.cursor,
      input.limit,
      toView,
    );
  }

  /** A user's own XP events, newest first. */
  async ownEvents(
    workspaceId: string,
    userId: string,
    options: { cursor?: string | null; limit?: number } = {},
  ): Promise<{ events: MyXpEventView[]; nextCursor: string | null }> {
    return this.page({ workspaceId, userId }, options.cursor, options.limit, toMyView);
  }

  /** A user's own summary: level, XP (awarded and waiting), streak and the badges they hold. */
  async myGrowth(workspaceId: string, userId: string): Promise<MyGrowth> {
    const [awarded, waiting, streak, awards] = await Promise.all([
      this.prisma.xpEvent.aggregate({ where: { workspaceId, userId, status: 'AWARDED' }, _sum: { amount: true } }),
      this.prisma.xpEvent.aggregate({ where: { workspaceId, userId, status: { in: ['PENDING', 'HELD'] } }, _sum: { amount: true } }),
      this.prisma.streak.findUnique({ where: { userId }, select: { current: true, longest: true } }),
      this.prisma.badgeAward.findMany({
        where: { workspaceId, userId, revokedAt: null },
        orderBy: { awardedAt: 'asc' },
        select: { badgeId: true, awardedAt: true, badge: { select: { name: true, icon: true } } },
      }),
    ]);
    const awardedXp = awarded._sum.amount ?? 0;
    const level = await this.levels.levelFor(workspaceId, awardedXp);
    return {
      awardedXp,
      pendingXp: waiting._sum.amount ?? 0,
      level: level?.name ?? null,
      streak: { current: streak?.current ?? 0, longest: streak?.longest ?? 0 },
      badges: awards.map((a) => ({ badgeId: a.badgeId, name: a.badge.name, icon: a.badge.icon, awardedAt: a.awardedAt.toISOString() })),
    };
  }

  private async page<V>(
    where: object,
    cursor: string | null | undefined,
    limit: number | undefined,
    view: (row: Parameters<typeof toView>[0]) => V,
  ): Promise<{ events: V[]; nextCursor: string | null }> {
    const skip = parseCursor(cursor);
    const take = Math.min(limit ?? MAX_PAGE, MAX_PAGE);
    const rows = await this.prisma.xpEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    });
    return { events: rows.slice(0, take).map(view), nextCursor: rows.length > take ? String(skip + take) : null };
  }
}
