import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { BadgesService } from '../badges/badges.service.js';
import { StreakService } from '../streak/streak.service.js';
import { orgToday } from '../time/org-time.js';

export interface NightlyResult {
  streaksHandled: number;
  streaksFailed: number;
  badgesChecked: number;
  badgesFailed: number;
  awarded: number;
  revoked: number;
}

/**
 * The moments when a streak or a badge may have changed. Streaks and automatic badges are derived
 * from other things (sprints, kudos XP, freezes), so something has to re-check them when those
 * change. This is that something (FR-GRW-39, FR-GRW-45).
 *
 * Rules every method follows:
 *  - It runs AFTER the change is saved, never inside it. The sprint rows belong to the sprint
 *    squad, so the streak can only be read once their transaction has committed.
 *  - It never throws. The change that caused it already happened; a failed re-check is logged and
 *    the nightly run catches it up. (A badge is never lost: it is derived from the data.)
 *  - It is safe to call any number of times: awards are created once, recalculation is idempotent.
 */
@Injectable()
export class GrowthTriggersService {
  private readonly logger = new Logger(GrowthTriggersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streaks: StreakService,
    private readonly badges: BadgesService,
  ) {}

  /** A sprint was saved: refresh the user's streak, then check their automatic badges. */
  async afterSprint(workspaceId: string, userId: string): Promise<void> {
    await this.safely(`after sprint of ${userId}`, async () => {
      await this.streaks.recalc(workspaceId, userId);
      await this.badges.evaluateAuto(workspaceId, userId);
    });
  }

  /** A freeze was granted: it can extend a streak, so check the user's automatic badges. */
  async afterStreakChange(workspaceId: string, userId: string): Promise<void> {
    await this.safely(`after streak change of ${userId}`, async () => {
      await this.badges.evaluateAuto(workspaceId, userId);
    });
  }

  /**
   * A PM decided an XP event. Only a kudos event matters: its approval (or the reversal of an
   * approved one) changes the number of approved senders of the receiver.
   */
  async afterXpDecision(workspaceId: string, eventId: string): Promise<void> {
    await this.safely(`after XP decision ${eventId}`, async () => {
      const event = await this.prisma.xpEvent.findFirst({
        where: { id: eventId, workspaceId },
        select: { userId: true, source: true },
      });
      if (event?.source === 'KUDOS') {
        await this.badges.evaluateAuto(workspaceId, event.userId);
      }
    });
  }

  /**
   * The nightly run at the day change: refreshes every active user's streak (a missed day shows up
   * without a new event) and re-checks their automatic badges. One user's failure does not stop
   * the others. Who calls it on a schedule is the platform's job (OQ-G-7); this is the entry point.
   */
  async nightly(now: Date, workspaceId?: string): Promise<NightlyResult> {
    const streak = await this.streaks.runStreakRefresh(now, workspaceId);
    const asOf = orgToday(now);
    const users = await this.prisma.user.findMany({
      where: { archivedAt: null, ...(workspaceId ? { workspaceId } : {}) },
      select: { userId: true, workspaceId: true },
    });
    const result: NightlyResult = {
      streaksHandled: streak.handled,
      streaksFailed: streak.failed,
      badgesChecked: 0,
      badgesFailed: 0,
      awarded: 0,
      revoked: 0,
    };
    for (const user of users) {
      try {
        const outcome = await this.badges.evaluateAuto(user.workspaceId, user.userId, { asOf });
        result.badgesChecked += 1;
        result.awarded += outcome.awarded.length;
        result.revoked += outcome.revoked.length;
      } catch (error) {
        result.badgesFailed += 1;
        this.logger.error(`Nightly badge check failed for ${user.userId}: ${String(error)}`);
      }
    }
    this.logger.log(
      `Nightly: ${result.streaksHandled} streaks, ${result.badgesChecked} badge checks, ${result.awarded} awarded, ${result.revoked} revoked`,
    );
    return result;
  }

  private async safely(what: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.logger.error(`Re-check ${what} failed: ${String(error)}`);
    }
  }
}
