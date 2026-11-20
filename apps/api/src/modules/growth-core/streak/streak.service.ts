import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { FreezeSource } from '../../../generated/prisma/enums.js';
import { GrowthError } from '../errors.js';
import { lockUser } from '../locks.js';
import { CALENDAR_SOURCE, type CalendarSourcePort } from '../ports/calendar-source.port.js';
import type { Db, Tx } from '../ports/db.js';
import { SPRINT_SOURCE, type SprintSourcePort } from '../ports/sprint-source.port.js';
import { CLOCK, type ClockPort } from '../time/clock.port.js';
import { orgToday, parseDay, type DayString } from '../time/org-time.js';
import { computeStreak, type StreakResult } from './compute-streak.js';

export interface GrantFreezeInput {
  workspaceId: string;
  /** The granting PM, from the session. Never trusted from a request body. */
  pmId: string;
  userId: string;
  date: DayString;
  source: FreezeSource;
  /** Private: only PMs ever see it. */
  reason: string;
}

/** What a PM sees of a freeze. */
export interface FreezeForPm {
  id: string;
  date: DayString;
  source: FreezeSource;
  reason: string;
  grantedById: string;
}

/** What the user sees of a freeze: never the reason. */
export interface FreezeForUser {
  date: DayString;
  source: FreezeSource;
}

const SOURCES: FreezeSource[] = ['LEAVE', 'HOLIDAY'];
const dayOf = (date: Date): DayString => date.toISOString().slice(0, 10);

/**
 * The sprint streak and PM freezes. The Streak row is a CACHE: it is always recomputed from
 * the sprint submissions, the calendar (leave, holidays) and the PM freezes, never counted up.
 * A streak creates no XP (D-03).
 */
@Injectable()
export class StreakService {
  private readonly logger = new Logger(StreakService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SPRINT_SOURCE) private readonly sprints: SprintSourcePort,
    @Inject(CALENDAR_SOURCE) private readonly calendar: CalendarSourcePort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /**
   * Recomputes one user's streak and saves the cache row, in a transaction under the per-user
   * lock. Pass `tx` to join the caller's transaction. Safe to call any number of times.
   */
  async recalc(workspaceId: string, userId: string, asOf?: DayString, tx?: Tx): Promise<StreakResult> {
    const today = asOf ?? orgToday(this.clock.now());
    const run = async (t: Tx): Promise<StreakResult> => {
      await lockUser(t, userId);
      const { any: result } = await this.measure(workspaceId, userId, today, t);
      const last = result.lastSubmissionDate ? parseDay(result.lastSubmissionDate) : null;
      await t.streak.upsert({
        where: { userId },
        create: { workspaceId, userId, current: result.current, longest: result.longest, lastSubmissionDate: last },
        update: { current: result.current, longest: result.longest, lastSubmissionDate: last },
      });
      return result;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * The streak numbers, read from the sprint and calendar sources and the PM freezes, without
   * saving anything: `any` counts every submission, `onTime` only on-time ones. Badge rules use
   * the `longest` of each.
   */
  async measure(
    workspaceId: string,
    userId: string,
    asOf: DayString,
    db: Db,
  ): Promise<{ any: StreakResult; onTime: StreakResult }> {
    const [submissions, calendarDays, freezes] = await Promise.all([
      this.sprints.submissionsOf(db, userId),
      this.calendar.frozenDays(db, userId, workspaceId),
      db.streakFreeze.findMany({ where: { userId }, select: { date: true } }),
    ]);
    const frozen = new Set<DayString>([...calendarDays, ...freezes.map((f) => dayOf(f.date))]);
    return {
      any: computeStreak(submissions, frozen, asOf),
      onTime: computeStreak(submissions, frozen, asOf, 'ON_TIME'),
    };
  }

  /**
   * The nightly refresh: recalculates every active user so a missed day shows up without a new
   * event. Scheduling it (a cron) is wired separately; tests call this directly. One user's
   * failure is logged and does not stop the others.
   */
  async runStreakRefresh(now: Date, workspaceId?: string): Promise<{ handled: number; failed: number }> {
    const asOf = orgToday(now);
    const users = await this.prisma.user.findMany({
      where: { archivedAt: null, ...(workspaceId ? { workspaceId } : {}) },
      select: { userId: true, workspaceId: true },
    });
    let handled = 0;
    let failed = 0;
    for (const user of users) {
      try {
        await this.recalc(user.workspaceId, user.userId, asOf);
        handled += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(`Streak refresh failed for ${user.userId}: ${String(error)}`);
      }
    }
    this.logger.log(`Streak refresh: ${handled} users handled, ${failed} failed`);
    return { handled, failed };
  }

  /**
   * A PM freezes one day for a user in their scope (leave or a holiday): that day neither counts
   * nor breaks the streak. One freeze per user and date. The streak is recomputed in the same
   * transaction.
   */
  async grantFreeze(input: GrantFreezeInput): Promise<{ freezeId: string }> {
    const reason = input.reason.trim();
    if (reason === '') {
      throw new GrowthError('REASON_REQUIRED', 'A reason is required.');
    }
    if (!SOURCES.includes(input.source)) {
      throw new GrowthError('VALIDATION', 'A freeze source must be LEAVE or HOLIDAY');
    }
    let date: Date;
    try {
      date = parseDay(input.date);
    } catch {
      throw new GrowthError('VALIDATION', 'A freeze date must be a real day written YYYY-MM-DD');
    }

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

      const { count } = await tx.streakFreeze.createMany({
        data: [
          {
            workspaceId: input.workspaceId,
            userId: user.userId,
            date,
            source: input.source,
            reason,
            grantedById: input.pmId,
          },
        ],
        skipDuplicates: true,
      });
      if (count === 0) {
        throw new GrowthError('ALREADY_FROZEN', `${input.date} is already frozen for this user`);
      }
      const freeze = await tx.streakFreeze.findUniqueOrThrow({
        where: { userId_date: { userId: user.userId, date } },
        select: { id: true },
      });
      await this.recalc(input.workspaceId, user.userId, undefined, tx);
      return { freezeId: freeze.id };
    });
  }

  /** The freezes of a user, with their private reasons: only for the user's own PM. */
  async listFreezesForPm(workspaceId: string, pmId: string, userId: string): Promise<FreezeForPm[]> {
    const user = await this.prisma.user.findFirst({ where: { userId, workspaceId }, select: { pmId: true } });
    if (!user) {
      throw new GrowthError('NOT_FOUND', 'User not found');
    }
    if (user.pmId !== pmId) {
      throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
    }
    const rows = await this.prisma.streakFreeze.findMany({ where: { userId }, orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      date: dayOf(r.date),
      source: r.source,
      reason: r.reason,
      grantedById: r.grantedById,
    }));
  }

  /** The user's own view of their freezes: the date and source, never the reason. */
  async listOwnFreezes(userId: string): Promise<FreezeForUser[]> {
    const rows = await this.prisma.streakFreeze.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
      select: { date: true, source: true },
    });
    return rows.map((r) => ({ date: dayOf(r.date), source: r.source }));
  }
}
