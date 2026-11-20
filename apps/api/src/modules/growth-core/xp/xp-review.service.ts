import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { XpStatus } from '../../../generated/prisma/enums.js';
import { GrowthError } from '../errors.js';
import { lockUser } from '../locks.js';
import { LEVELS, type LevelsPort } from '../ports/levels.port.js';
import { NOTIFICATIONS, type NotificationPort } from '../ports/notification.port.js';
import { isAllowedMove } from './review-moves.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { XpLedger } from './xp-ledger.types.js';

export interface DecideInput {
  workspaceId: string;
  eventId: string;
  /** The deciding PM, from the session. Never trusted from a request body. */
  pmId: string;
  toStatus: XpStatus;
  reason: string;
}

export interface DecideResult {
  eventId: string;
  fromStatus: XpStatus;
  toStatus: XpStatus;
}

const NOTICE_TITLE: Partial<Record<XpStatus, string>> = {
  AWARDED: 'XP awarded',
  HELD: 'XP put on hold',
  REJECTED: 'XP rejected',
  REVERSED: 'XP reversed',
};

/**
 * A PM decides an XP event: award, hold, reject or reverse, always with a reason.
 *
 * One transaction does everything: it locks the user, re-reads the event's current status,
 * checks the move is allowed, updates the status, writes one XpReview row and the user's
 * notice. If any step fails nothing is saved. The lock plus the "expected status" in the
 * update make a decision happen once: of two simultaneous decisions, one wins and the other
 * gets BAD_TRANSITION. An approval that lifts the user over a level threshold also creates the
 * "Level up" notice, in the same transaction.
 */
@Injectable()
export class XpReviewService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationPort,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(LEVELS) private readonly levels: Pick<LevelsPort, 'notifyIfLeveledUp'>,
  ) {}

  async decide(input: DecideInput): Promise<DecideResult> {
    const reason = input.reason.trim();
    if (reason === '') {
      throw new GrowthError('REASON_REQUIRED', 'A reason is required.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Find the event (and so the user to lock) before taking the lock.
      const found = await tx.xpEvent.findFirst({
        where: { id: input.eventId, workspaceId: input.workspaceId },
        select: { userId: true },
      });
      if (!found) {
        throw new GrowthError('NOT_FOUND', 'XP event not found');
      }

      await lockUser(tx, found.userId);

      // Re-read under the lock: the status may have changed while we waited.
      const event = await tx.xpEvent.findUniqueOrThrow({
        where: { id: input.eventId },
        select: { id: true, userId: true, status: true, amount: true, user: { select: { pmId: true } } },
      });
      if (event.user.pmId !== input.pmId) {
        throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
      }

      const from = event.status;
      if (!isAllowedMove(from, input.toStatus)) {
        throw new GrowthError('BAD_TRANSITION', `XP cannot move from ${from} to ${input.toStatus}`);
      }

      // Awarded XP counts, so the total changes when it enters or leaves AWARDED.
      const delta =
        (input.toStatus === 'AWARDED' ? event.amount : 0) - (from === 'AWARDED' ? event.amount : 0);
      const totalBefore = await this.ledger.awardedTotal(event.userId, tx);
      if (delta !== 0 && totalBefore + delta < 0) {
        throw new GrowthError('NEGATIVE_TOTAL', 'This would take the XP total below 0');
      }

      const updated = await tx.xpEvent.updateMany({
        where: { id: event.id, status: from },
        data: { status: input.toStatus, reason },
      });
      if (updated.count !== 1) {
        throw new GrowthError('BAD_TRANSITION', 'This XP event was already decided');
      }

      await tx.xpReview.create({
        data: {
          workspaceId: input.workspaceId,
          xpEventId: event.id,
          reviewerId: input.pmId,
          fromStatus: from,
          toStatus: input.toStatus,
          reason,
        },
      });

      await this.notifications.notifyUser(tx, {
        workspaceId: input.workspaceId,
        userId: event.userId,
        category: 'XP decisions',
        title: NOTICE_TITLE[input.toStatus] ?? 'XP decision',
        message: `${NOTICE_TITLE[input.toStatus] ?? 'XP decision'}: ${reason}`,
      });

      // Only an approval is earned XP. A hold, reject or reversal never lifts a level.
      if (input.toStatus === 'AWARDED') {
        await this.levels.notifyIfLeveledUp(tx, {
          workspaceId: input.workspaceId,
          userId: event.userId,
          before: totalBefore,
          after: totalBefore + delta,
        });
      }

      return { eventId: event.id, fromStatus: from, toStatus: input.toStatus };
    });
  }
}
