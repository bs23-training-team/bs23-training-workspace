import { Injectable } from '@nestjs/common';
import { SprintError } from './errors.js';
import { SprintRepository } from './sprint.repository.js';
import { pmIdOf, workspaceIdOf, type SprintActor } from './http/actor.js';
import {
  addDays,
  monthEnd,
  monthStart,
  reportWeekEnd,
  reportWeekStart,
} from './time/org-time.js';
import type { SprintReportQueryDto } from './dto/pm-sprint.dto.js';
import type {
  SprintFigure,
  SprintReportRow,
  SprintReportView,
} from './dto/sprint-response.dto.js';

/**
 * The PM's sprint report (P6, FR-DS-07, US-69).
 *
 * "Every report option shows hours and blockers per user" — so the answer is **one row per
 * user** in the PM's scope, and every number on the row says where it came from.
 *
 * The rules:
 * - **The caller is the PM who signed in.** Nothing in the query says whose report this is.
 * - **The scope** is `User.pmId === pmId` (ASSUMPTIONS D8). A team report covers the members
 *   of that team **that the PM manages**; a member another PM manages is left out. A team of
 *   another PM is 403 `FORBIDDEN_SCOPE` and nothing is read.
 * - **A missing value is never a zero** (PRD NFR-09, ASSUMPTIONS E8). A figure is `MISSING`
 *   when the source table has **no rows** for that user in the window; it is a **real zero**
 *   when the table has rows that sum or count to zero. The two are different facts.
 *
 * The service reads only. It writes nothing and takes no port, so it stays independent of the
 * notification and XP hand-offs.
 */

/** A task row the report works from. */
type ReportTaskRow = {
  userId: string;
  date: Date;
  plannedHours: unknown;
  actualHours: unknown;
  blocker: string;
};

/** A submission row the report works from. */
type ReportSubmissionRow = {
  userId: string;
  date: Date;
  onTime: boolean;
};

/** The days a report covers. */
interface ReportWindow {
  from: string;
  to: string;
}

/** A user in the report's scope. */
interface ReportUser {
  userId: string;
  name: string;
}

@Injectable()
export class PmReportsService {
  constructor(private readonly repository: SprintRepository) {}

  /**
   * Builds the sprint report the PM asked for (P6).
   *
   * The order of the rules matters:
   * 1. who the caller is (a user gets 403),
   * 2. which days the report covers,
   * 3. **the scope check**, before anything is read — a team of another PM answers 403
   *    `FORBIDDEN_SCOPE` and no task or submission is looked at,
   * 4. the users in that scope,
   * 5. the tasks and the submissions of those users,
   * 6. one row per user.
   */
  async getReports(actor: SprintActor, query: SprintReportQueryDto): Promise<SprintReportView> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const window = this.windowOf(query.type, query.date);

    // --- The scope check, before anything is read.
    let users: ReportUser[];
    if (query.teamId !== undefined) {
      await this.assertOwnTeam(workspaceId, pmId, query.teamId);
      users = await this.teamUsers(workspaceId, pmId, query.teamId, window);
    } else {
      users = await this.repository.findReportUsers(workspaceId, pmId);
    }

    const userIds = users.map((user) => user.userId);

    const [tasks, submissions] = await Promise.all([
      userIds.length > 0
        ? this.repository.findReportTasks(
            workspaceId,
            userIds,
            toUtcDay(window.from),
            toUtcDay(window.to),
          )
        : Promise.resolve([] as ReportTaskRow[]),
      userIds.length > 0
        ? this.repository.findReportSubmissions(
            workspaceId,
            userIds,
            toUtcDay(window.from),
            toUtcDay(window.to),
          )
        : Promise.resolve([] as ReportSubmissionRow[]),
    ]);

    const tasksByUser = groupBy(tasks, (task) => task.userId);
    const submissionsByUser = groupBy(submissions, (submission) => submission.userId);

    const rows: SprintReportRow[] = users.map((user) => {
      const userTasks = tasksByUser.get(user.userId) ?? [];
      const userSubmissions = submissionsByUser.get(user.userId) ?? [];

      return {
        userId: user.userId,
        name: user.name,
        plannedHours: hoursFigure(userTasks, (task) => task.plannedHours),
        actualHours: hoursFigure(userTasks, (task) => task.actualHours),
        taskCount: taskCountFigure(userTasks.length),
        submittedDays: submissionFigure(userSubmissions, (row) => row),
        onTimeDays: submissionFigure(userSubmissions, (row) => row.onTime),
        blockers: userTasks
          .map((task) => task.blocker.trim())
          .filter((blocker) => blocker.length > 0),
      };
    });

    return {
      type: query.type,
      date: query.date,
      from: window.from,
      to: window.to,
      teamId: query.teamId ?? null,
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // The window
  // ---------------------------------------------------------------------------

  /**
   * The days a report covers.
   *
   * - `daily` — the day itself,
   * - `weekly` — the **report week** that contains the day: **Sunday through Friday**, with
   *   **only Saturday** off (ASSUMPTIONS L13). A report week is **not** a sprint week — the
   *   sprint week runs Monday to Sunday and is left exactly as it was (ASSUMPTIONS L14),
   * - `biweekly` — the **two report weeks ending with** that one: this week and the week
   *   before it, Sunday to Friday each, Saturdays excluded. The windows nest:
   *   daily ⊂ weekly ⊂ biweekly (ASSUMPTIONS L1),
   * - `monthly` — the **calendar month** that contains the day. A month is not a report week
   *   either, so it is not a number of weeks (ASSUMPTIONS L1).
   *
   * The window is a **range of days**, so the Saturday inside it is still inside the range
   * and the query still asks for it. What the window does is say which week the report is
   * about: the Saturday between two report weeks belongs to neither.
   */
  private windowOf(type: SprintReportQueryDto['type'], date: string): ReportWindow {
    switch (type) {
      case 'daily':
        return { from: date, to: date };
      case 'weekly':
        return { from: reportWeekStart(date), to: reportWeekEnd(date) };
      case 'biweekly':
        return {
          from: reportWeekStart(addDays(reportWeekStart(date), -7)),
          to: reportWeekEnd(date),
        };
      case 'monthly':
        return { from: monthStart(date), to: monthEnd(date) };
    }
  }

  // ---------------------------------------------------------------------------
  // The scope
  // ---------------------------------------------------------------------------

  /**
   * Checks that the team is the PM's own, and answers 403 `FORBIDDEN_SCOPE` when it is not.
   *
   * The same helper and the same message as the team sheet (P1–P5): a team of another PM and
   * a team that does not exist answer the same way, so the caller cannot probe for the teams
   * of other PMs.
   */
  private async assertOwnTeam(workspaceId: string, pmId: string, teamId: string): Promise<void> {
    const team = await this.repository.findTeam(workspaceId, teamId);
    if (!team || team.pmId !== pmId) {
      throw new SprintError('FORBIDDEN_SCOPE', 'You can only work on your own teams');
    }
  }

  /**
   * The users of one team that belong in this PM's report.
   *
   * Three rules, and all three matter:
   * - the member must be managed by **this** PM (`user.pmId === pmId`) — a member another PM
   *   manages is not in this report (ASSUMPTIONS D8),
   * - the member must not be **archived**,
   * - a member who **left before the window** is out; a member who left **inside** it stays,
   *   and their row shows that there was no data (ASSUMPTIONS L8).
   */
  private async teamUsers(
    workspaceId: string,
    pmId: string,
    teamId: string,
    window: ReportWindow,
  ): Promise<ReportUser[]> {
    const memberships = await this.repository.findReportTeamUsers(workspaceId, teamId);

    return memberships
      .filter((membership) => membership.user.pmId === pmId)
      .filter((membership) => membership.user.archivedAt === null)
      .filter(
        (membership) =>
          membership.leftAt === null || isOnOrAfter(membership.leftAt, window.from),
      )
      .map((membership) => ({
        userId: membership.user.userId,
        name: membership.user.name,
      }));
  }
}

// -----------------------------------------------------------------------------
// The figures
// -----------------------------------------------------------------------------

/**
 * The sum of an hours column, with its source.
 *
 * **No rows means the value is missing, not zero** (PRD NFR-09): a user with no task in the
 * window has no planned hours, and the report says so with `value: null, source: 'MISSING'`.
 * Rows that sum to zero are a **real zero** — the user has a task, and that task is worth
 * zero hours.
 */
function hoursFigure(tasks: ReportTaskRow[], pick: (task: ReportTaskRow) => unknown): SprintFigure {
  if (tasks.length === 0) {
    return { value: null, source: 'MISSING' };
  }
  const total = tasks.reduce((sum, task) => sum + Number(pick(task) ?? 0), 0);
  return { value: round(total), source: 'TASK' };
}

/**
 * The number of tasks, with its source.
 *
 * The same rule as the hours: no tasks means missing, tasks that count to zero is a real
 * zero.
 */
function taskCountFigure(count: number): SprintFigure {
  if (count === 0) {
    return { value: null, source: 'MISSING' };
  }
  return { value: count, source: 'TASK' };
}

/**
 * A count over the submissions of a user, with its source.
 *
 * **The rule is about the rows, not about the count.** A user with **no** submission in the
 * window has no "days submitted" value at all — it is missing, not zero (PRD NFR-09,
 * ASSUMPTIONS E8). A user who **did** submit and was late has a real zero on-time days:
 * the submissions are there, and none of them was on time.
 */
function submissionFigure(
  submissions: ReportSubmissionRow[],
  pick: (row: ReportSubmissionRow) => unknown,
): SprintFigure {
  if (submissions.length === 0) {
    return { value: null, source: 'MISSING' };
  }
  const count = submissions.filter((row) => Boolean(pick(row))).length;
  return { value: count, source: 'SUBMISSION' };
}

/** One decimal place, the way the hours are stored. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Groups the rows of a list by a key. */
function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}

/** 'YYYY-MM-DD' to the UTC midnight a `@db.Date` column holds. */
function toUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/**
 * True when a `leftAt` date is on or after the first day of the window.
 *
 * `leftAt` is a `DateTime` column and the window is a day, so the comparison is made on the
 * day of the leaving date.
 */
function isOnOrAfter(leftAt: Date, day: string): boolean {
  return leftAt.toISOString().slice(0, 10) >= day;
}
