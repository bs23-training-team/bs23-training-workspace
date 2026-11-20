import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthError } from '../errors.js';
import { lockUser } from '../locks.js';
import { CLOCK, type ClockPort } from '../time/clock.port.js';
import { orgToday, parseDay } from '../time/org-time.js';
import { validateAdjustment } from './adjustment-input.js';
import { manualKey } from './xp-keys.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { XpLedger } from './xp-ledger.types.js';

export interface AdjustInput {
  workspaceId: string;
  /** The user whose XP changes. */
  userId: string;
  /** The adjusting PM, from the session. Never trusted from a request body. */
  pmId: string;
  /** Non-zero whole number: positive adds XP, negative removes it. */
  amount: number;
  reason: string;
}

export interface AdjustResult {
  eventId: string;
  /** The user's awarded total after this adjustment. */
  newTotal: number;
}

/**
 * A PM corrects a user's XP by hand. The change is an AWARDED MANUAL_ADJUSTMENT event at once:
 * there is nothing to review, so no XpReview row. It is not earned XP, so it never triggers a
 * level-up notice (this service has no notification dependency on purpose).
 *
 * The user is locked for the whole transaction, so the "total never below 0" check and the
 * insert cannot interleave with another adjustment or a review for the same user.
 */
@Injectable()
export class XpAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async adjust(input: AdjustInput): Promise<AdjustResult> {
    const { amount, reason } = validateAdjustment(input.amount, input.reason);

    return this.prisma.$transaction(async (tx) => {
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

      const before = await this.ledger.awardedTotal(user.userId, tx);
      if (before + amount < 0) {
        throw new GrowthError('NEGATIVE_TOTAL', 'This would take the XP total below 0');
      }

      const { event } = await this.ledger.createEvent(
        {
          workspaceId: input.workspaceId,
          userId: user.userId,
          source: 'MANUAL_ADJUSTMENT',
          amount,
          key: manualKey(randomUUID()),
          evidence: `Manual adjustment by ${input.pmId}`,
          reason,
          occurredOn: parseDay(orgToday(this.clock.now())),
        },
        tx,
      );
      return { eventId: event.id, newTotal: before + amount };
    });
  }
}
