import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { KudosCategory } from '../../../generated/prisma/enums.js';
import {
  CLOCK,
  GrowthError,
  XpLedgerService,
  XpRulesService,
  kudosKey,
  lockUser,
  orgToday,
  parseDay,
  weekEnd,
  weekStart,
  type ClockPort,
  type XpLedger,
} from '../../growth-core/index.js';
import {
  ENGAGEMENT_NOTIFICATIONS,
  type EngagementNotificationPort,
} from '../ports/engagement-notification.port.js';
import { FLAG_SUSPICIOUS, cooldownActive, kudosOutcome } from './kudos-rules.js';

export interface SendKudosInput {
  workspaceId: string;
  /** The sender, from the session. Never trusted from a request body. */
  fromUserId: string;
  toUserId: string;
  category: KudosCategory;
  message: string;
  // No date: the day of a kudos is always today in org time, decided here.
}

export interface SendKudosResult {
  kudosId: string;
  suspicious: boolean;
  /** XP the receiver gets (0 when the weekly cap was reached). */
  amount: number;
  flag: string | null;
  xpEventId: string;
}

const CATEGORIES: KudosCategory[] = ['HELPFUL', 'GREAT_EXPLANATION', 'TEAMWORK'];

/**
 * Sending kudos. One transaction does everything: locks both users (in sorted order, so two
 * opposite kudos cannot deadlock), checks the weekly send limit and the per-person cooldown,
 * finds a mutual exchange, applies the receiver's weekly cap, saves the kudos, asks growth-core
 * (IF-01) to create the receiver's XP event and hold the earlier one, and creates the notices.
 * Engagement never writes XpEvent itself.
 */
@Injectable()
export class KudosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(XpRulesService) private readonly rules: XpRulesService,
    @Inject(ENGAGEMENT_NOTIFICATIONS) private readonly notifications: EngagementNotificationPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async send(input: SendKudosInput): Promise<SendKudosResult> {
    const message = input.message.trim();
    if (message === '') {
      throw new GrowthError('MESSAGE_REQUIRED', 'A message is required.');
    }
    if (input.fromUserId === input.toUserId) {
      throw new GrowthError('SELF_KUDOS', 'You cannot send kudos to yourself');
    }
    if (!CATEGORIES.includes(input.category)) {
      throw new GrowthError('VALIDATION', 'Unknown kudos category');
    }
    const today = orgToday(this.clock.now());
    const from = weekStart(today);
    const to = weekEnd(today);

    return this.prisma.$transaction(async (tx) => {
      const people = await tx.user.findMany({
        where: { workspaceId: input.workspaceId, userId: { in: [input.fromUserId, input.toUserId] } },
        select: { userId: true, name: true, pmId: true, archivedAt: true },
      });
      const sender = people.find((p) => p.userId === input.fromUserId);
      const receiver = people.find((p) => p.userId === input.toUserId);
      if (!sender || !receiver) {
        throw new GrowthError('NOT_FOUND', 'User not found');
      }
      if (sender.archivedAt || receiver.archivedAt) {
        throw new GrowthError('USER_ARCHIVED', 'Kudos cannot involve an archived user');
      }

      // Fixed order: two opposite kudos at once wait for each other instead of deadlocking,
      // and the second one then sees the first.
      for (const userId of [input.fromUserId, input.toUserId].sort()) {
        await lockUser(tx, userId);
      }

      const rules = await this.rules.getAll(input.workspaceId, tx);

      const sentThisWeek = await tx.kudos.count({
        where: { fromUserId: sender.userId, sentOn: { gte: parseDay(from), lte: parseDay(to) } },
      });
      if (sentThisWeek >= rules.kudosSendLimitPerWeek) {
        throw new GrowthError('SEND_LIMIT', 'You have reached this week\'s kudos limit');
      }

      const last = await tx.kudos.findFirst({
        where: { fromUserId: sender.userId, toUserId: receiver.userId },
        orderBy: { sentOn: 'desc' },
        select: { sentOn: true },
      });
      if (cooldownActive(last ? last.sentOn.toISOString().slice(0, 10) : null, today, rules.kudosCooldownDays)) {
        throw new GrowthError('COOLDOWN', 'You already sent kudos to this person recently');
      }

      // Mutual: the receiver already sent the sender a kudos in the same Monday week.
      const earlier = await tx.kudos.findMany({
        where: { fromUserId: receiver.userId, toUserId: sender.userId, sentOn: { gte: parseDay(from), lte: parseDay(to) } },
        select: { id: true },
      });
      const mutual = earlier.length > 0;

      const receivedThisWeek = await this.ledger.sumXp(
        {
          userId: receiver.userId,
          source: 'KUDOS',
          statuses: ['PENDING', 'HELD', 'AWARDED'],
          from: parseDay(from),
          to: parseDay(to),
        },
        tx,
      );
      const outcome = kudosOutcome({
        baseAmount: rules.kudos,
        receivedThisWeek,
        weeklyCap: rules.kudosReceivedCapPerWeek,
        mutual,
      });

      const kudos = await tx.kudos.create({
        data: {
          workspaceId: input.workspaceId,
          fromUserId: sender.userId,
          toUserId: receiver.userId,
          category: input.category,
          message,
          sentOn: parseDay(today),
          suspicious: mutual,
        },
        select: { id: true },
      });

      const { event } = await this.ledger.createEvent(
        {
          workspaceId: input.workspaceId,
          userId: receiver.userId,
          source: 'KUDOS',
          amount: outcome.amount,
          key: kudosKey(kudos.id),
          evidence: `Kudos from ${sender.name} (${input.category})`,
          occurredOn: parseDay(today),
          kudosId: kudos.id,
          flag: outcome.flag,
          ...(outcome.held ? { status: 'HELD' as const } : {}),
        },
        tx,
      );

      if (mutual) {
        const earlierIds = earlier.map((k) => k.id);
        await tx.kudos.updateMany({ where: { id: { in: earlierIds } }, data: { suspicious: true } });
        await this.ledger.holdPending(earlierIds, FLAG_SUSPICIOUS, tx);
      }

      await this.notifications.notifyUser(tx, {
        workspaceId: input.workspaceId,
        userId: receiver.userId,
        category: 'Kudos received',
        title: 'Kudos received',
        message: `${sender.name} sent you kudos: ${message}`,
      });
      if (mutual) {
        // The PM of each person, but only one notice when both have the same PM.
        for (const pmId of new Set([sender.pmId, receiver.pmId])) {
          await this.notifications.notifyPm(tx, {
            workspaceId: input.workspaceId,
            pmId,
            category: 'Suspicious kudos',
            title: 'Suspicious kudos',
            message: `Mutual kudos between ${sender.name} and ${receiver.name} this week were held for review.`,
          });
        }
      }

      return {
        kudosId: kudos.id,
        suspicious: mutual,
        amount: outcome.amount,
        flag: outcome.flag,
        xpEventId: event.id,
      };
    });
  }
}
