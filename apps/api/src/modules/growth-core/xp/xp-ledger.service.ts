import { Injectable } from '@nestjs/common';
import { GrowthError } from '../errors.js';
import type { Db } from '../ports/db.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { initialStatus } from './initial-status.js';
import type {
  AwardedTotalsQuery,
  CreateEventResult,
  NewXpEvent,
  XpLedger,
} from './xp-ledger.types.js';

/**
 * The XP ledger: the only code that writes XpEvent. Append-only: an event is created once,
 * and only its status changes later (through review, a later task).
 *
 * Every method takes an optional `db`. Pass a transaction handle to make the call part of
 * the caller's transaction; leave it out to use the shared PrismaService.
 */
@Injectable()
export class XpLedgerService implements XpLedger {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an event, or does nothing if the key was already used (idempotent).
   * Uses INSERT ... ON CONFLICT DO NOTHING, so a duplicate does not raise an error and does
   * not abort a surrounding transaction.
   */
  async createEvent(input: NewXpEvent, db: Db = this.prisma): Promise<CreateEventResult> {
    this.validate(input);

    const { count } = await db.xpEvent.createMany({
      data: [
        {
          workspaceId: input.workspaceId,
          userId: input.userId,
          source: input.source,
          amount: input.amount,
          status: input.status ?? initialStatus(input.source),
          key: input.key,
          evidence: input.evidence.trim(),
          reason: input.reason ?? null,
          flag: input.flag ?? null,
          occurredOn: input.occurredOn,
          kudosId: input.kudosId ?? null,
          questId: input.questId ?? null,
          attemptId: input.attemptId ?? null,
        },
      ],
      skipDuplicates: true,
    });

    const event = await db.xpEvent.findUnique({
      where: { workspaceId_key: { workspaceId: input.workspaceId, key: input.key } },
      select: { id: true },
    });
    if (!event) {
      // The insert was skipped and no row exists: should be impossible with a unique key.
      throw new GrowthError('INTERNAL', 'XP event was neither created nor found');
    }
    return { event, created: count === 1 };
  }

  /** Total of AWARDED XP for one user. Pending, held, rejected and reversed never count. */
  async awardedTotal(userId: string, db: Db = this.prisma): Promise<number> {
    const result = await db.xpEvent.aggregate({
      where: { userId, status: 'AWARDED' },
      _sum: { amount: true },
    });
    return result._sum.amount ?? 0;
  }

  /**
   * AWARDED totals for several users, optionally limited to events whose occurredOn day is
   * between `from` and `to` (both inclusive). Every requested user is in the map; a user
   * with no matching events has 0.
   */
  async awardedTotals(query: AwardedTotalsQuery, db: Db = this.prisma): Promise<Map<string, number>> {
    const totals = new Map<string, number>(query.userIds.map((id) => [id, 0]));
    if (query.userIds.length === 0) {
      return totals;
    }
    const rows = await db.xpEvent.groupBy({
      by: ['userId'],
      where: {
        workspaceId: query.workspaceId,
        userId: { in: query.userIds },
        status: 'AWARDED',
        ...(query.from || query.to
          ? { occurredOn: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
          : {}),
      },
      _sum: { amount: true },
    });
    for (const row of rows) {
      totals.set(row.userId, row._sum.amount ?? 0);
    }
    return totals;
  }

  /**
   * The system moves still-PENDING kudos events to HELD and sets a flag (a suspicious
   * exchange). This is not a PM decision, so no XpReview row is written. Events that are
   * already AWARDED, rejected or reversed are left alone.
   */
  async holdPending(kudosIds: string[], flag: string, db: Db = this.prisma): Promise<void> {
    if (kudosIds.length === 0) {
      return;
    }
    await db.xpEvent.updateMany({
      where: { kudosId: { in: kudosIds }, status: 'PENDING' },
      data: { status: 'HELD', flag },
    });
  }

  private validate(input: NewXpEvent): void {
    if (!Number.isInteger(input.amount)) {
      throw new GrowthError('VALIDATION', 'XP amount must be a whole number');
    }
    if (input.evidence.trim() === '') {
      throw new GrowthError('VALIDATION', 'XP event needs evidence');
    }
    if (input.key.trim() === '') {
      throw new GrowthError('VALIDATION', 'XP event needs a key');
    }
  }
}
