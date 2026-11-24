import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CLOCK, XpRulesService, orgToday, parseDay, weekEnd, weekStart, type ClockPort } from '../../growth-core/index.js';

export interface KudosLimits {
  /** Kudos the user has sent in the current Monday week (Dhaka). */
  sentThisWeek: number;
  /** The most kudos one user may send in a week (an XP rule). */
  sendLimitPerWeek: number;
  /** Days before the user may send kudos to the same person again (an XP rule). */
  cooldownDays: number;
}

/**
 * What a user needs to know before sending kudos ("2 of 3 sent this week, 7-day cooldown per person"). The rules
 * themselves are a PM's to read; this gives the user only these three numbers. Counted the same way as when a kudos
 * is sent, so the screen and the refusal always agree.
 */
@Injectable()
export class KudosLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpRulesService) private readonly rules: XpRulesService,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async forUser(workspaceId: string, userId: string): Promise<KudosLimits> {
    const today = orgToday(this.clock.now());
    const [rules, sentThisWeek] = await Promise.all([
      this.rules.getAll(workspaceId),
      this.prisma.kudos.count({
        where: { fromUserId: userId, sentOn: { gte: parseDay(weekStart(today)), lte: parseDay(weekEnd(today)) } },
      }),
    ]);
    return { sentThisWeek, sendLimitPerWeek: rules.kudosSendLimitPerWeek, cooldownDays: rules.kudosCooldownDays };
  }
}
