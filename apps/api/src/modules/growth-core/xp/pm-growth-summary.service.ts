import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LevelsService } from '../levels/levels.service.js';
import { levelFor } from '../levels/level-set.js';
import { MAX_PAGE, parseCursor } from '../paging.js';
import { pmVisibleUsers } from '../visibility/pm-visible-users.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { XpLedger } from './xp-ledger.types.js';

export interface PmGrowthSummaryRow {
  userId: string;
  name: string;
  /** true when this PM manages the user. Only then may the PM change anything about them (FR-GRW-59). */
  managedByYou: boolean;
  /** XP that counts: AWARDED only. */
  awardedXp: number;
  /** XP waiting for a PM (PENDING and HELD), shown apart, never added to the total. */
  pendingXp: number;
  level: string | null;
  /** As stored: it is refreshed after a sprint and by the nightly run. */
  streak: { current: number; longest: number };
}

/**
 * One line per user for a PM's Trainees tab: XP, level and streak. Which users a PM can see comes from
 * pmVisibleUsers (the directory's rule), not from here. Names A to Z.
 */
@Injectable()
export class PmGrowthSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(LevelsService) private readonly levels: LevelsService,
  ) {}

  async page(
    workspaceId: string,
    pmId: string,
    input: { cursor?: string | null; limit?: number } = {},
  ): Promise<{ users: PmGrowthSummaryRow[]; nextCursor: string | null }> {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const people = await this.prisma.user.findMany({
      where: pmVisibleUsers(workspaceId),
      select: { userId: true, name: true, pmId: true },
      orderBy: [{ name: 'asc' }, { userId: 'asc' }],
      skip,
      take: take + 1,
    });
    const page = people.slice(0, take);
    const userIds = page.map((p) => p.userId);

    const [awarded, waiting, streaks, levels] = await Promise.all([
      this.ledger.awardedTotals({ workspaceId, userIds }),
      this.prisma.xpEvent.groupBy({
        by: ['userId'],
        where: { workspaceId, userId: { in: userIds }, status: { in: ['PENDING', 'HELD'] } },
        _sum: { amount: true },
      }),
      this.prisma.streak.findMany({ where: { userId: { in: userIds } }, select: { userId: true, current: true, longest: true } }),
      this.levels.active(workspaceId),
    ]);
    const pending = new Map(waiting.map((w) => [w.userId, w._sum.amount ?? 0]));
    const streakOf = new Map(streaks.map((s) => [s.userId, { current: s.current, longest: s.longest }]));

    return {
      users: page.map((p) => {
        const awardedXp = awarded.get(p.userId) ?? 0;
        return {
          userId: p.userId,
          name: p.name,
          managedByYou: p.pmId === pmId,
          awardedXp,
          pendingXp: pending.get(p.userId) ?? 0,
          level: levelFor(levels, awardedXp)?.name ?? null,
          streak: streakOf.get(p.userId) ?? { current: 0, longest: 0 },
        };
      }),
      nextCursor: people.length > take ? String(skip + take) : null,
    };
  }
}
