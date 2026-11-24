import { Inject, Injectable } from '@nestjs/common';
import { SprintError, isUniqueViolation } from './errors.js';
import { SprintRepository } from './sprint.repository.js';
import { APPROVAL_MAIL, type ApprovalMailPort } from './ports/approval-mail.port.js';
import { CALENDAR, type CalendarPort } from './ports/calendar.port.js';
import { XP_LEDGER, type XpLedgerPort } from './ports/xp-ledger.port.js';
import { CLOCK, type ClockPort } from './time/clock.port.js';
import {
  addDays,
  isBeforeCutoff,
  orgToday,
  parseDay,
  toOrgLocal,
  type DayString,
} from './time/org-time.js';
import { userIdOf, workspaceIdOf, type SprintActor } from './http/actor.js';
import type {
  SprintBoardView,
  SprintFigure,
  SprintHistoryItem,
  SprintHistoryView,
  SprintMeetingBannerView,
  SprintSubmissionView,
  SprintSummaryView,
  SprintTaskView,
  TaskOwnerView,
} from './dto/sprint-response.dto.js';
import type { TaskCategoryValue } from './dto/sprint.dto.js';
import type { TaskCategory, TaskVerification } from '../../generated/prisma/client.js';

/**
 * The business rules of the user-side sprint endpoints (U1 to U6, U8 to U10).
 *
 * The rules come from the Daily Sprint SRS and the PRD:
 * - a user sees **only their own** tasks; another user's task is not found, not merely hidden
 *   (PRD BR-08),
 * - a task done for oneself has neither a category nor an owner; a task done for an L&D team
 *   or an SBU has both (DS-01.3),
 * - an owner has to be active and has to match the category of the task (DS-01.6),
 * - an archived user creates nothing; their history stays readable (SRS E-25),
 * - a deleted task never appears again, anywhere (PRD BR-09),
 * - a carry forward is idempotent: carrying twice does not create two copies (DS-04.4),
 * - a missing figure is **missing**, not zero (PRD NFR-09).
 *
 * The service never reads identity from the request. The caller arrives as a `SprintActor`,
 * which the guard built from `req.user` and nothing else.
 */

/** A task row as the repository returns it. */
type TaskRow = {
  id: string;
  workspaceId: string;
  userId: string;
  date: Date;
  title: string;
  description: string;
  plannedHours: unknown;
  actualHours: unknown;
  blocker: string;
  done: boolean;
  category: TaskCategory | null;
  ownerId: string | null;
  verification: TaskVerification | null;
  carriedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { name: string } | null;
};

/** A figure that is really there. */
const present = (value: number): SprintFigure => ({ value, source: 'TASK' });

/** A figure that is not there. The PRD wants "missing", not zero (NFR-09). */
const missing = (): SprintFigure => ({ value: null, source: 'MISSING' });

/** Prisma returns a Decimal for a Decimal column; the API answers with a plain number. */
const toNumber = (value: unknown): number => Number(value ?? 0);

/**
 * The sprint rules used when the workspace has no `XpRule` row yet.
 *
 * These are the schema's own defaults (`sprintCutoff` "10:00", `onTimeSprint` 20). E09 owns
 * `XpRule` and seeds it, so the row is normally there; the fallback keeps a workspace that
 * has not been set up yet behaving exactly as the schema says it should.
 */
const DEFAULT_SPRINT_CUTOFF = '10:00';
const DEFAULT_ON_TIME_SPRINT_XP = 20;

@Injectable()
export class SprintService {
  constructor(
    private readonly repository: SprintRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(CALENDAR) private readonly calendar: CalendarPort,
    @Inject(APPROVAL_MAIL) private readonly approvalMail: ApprovalMailPort,
    @Inject(XP_LEDGER) private readonly xpLedger: XpLedgerPort,
  ) {}

  // ---------------------------------------------------------------------------
  // U1 — GET /sprint/task-owners?kind=
  // ---------------------------------------------------------------------------

  /**
   * The owners a task can be sent to.
   *
   * Only **active** owners of the caller's own workspace are returned: an owner that was
   * deactivated cannot be asked to verify anything (DS-01.6).
   */
  async listTaskOwners(actor: SprintActor, kind: TaskCategoryValue): Promise<TaskOwnerView[]> {
    // A PM has no tasks of their own, so the owner list is a user-only endpoint. The route
    // already says so with @Roles('TRAINEE'); this is the second line of defence.
    userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);
    const owners = await this.repository.findActiveOwners(workspaceId, kind);
    return owners.map((owner) => ({
      id: owner.id,
      name: owner.name,
      kind: owner.kind,
      email: owner.email,
    }));
  }

  // ---------------------------------------------------------------------------
  // U2 — GET /sprint/board?date=
  // ---------------------------------------------------------------------------

  /**
   * The board of one day: the caller's own tasks, and the tasks that could be carried forward.
   *
   * The carry candidates are **read-only** (OQ-8). The rows are created by
   * `POST /sprint/carry-forward`, never by reading the board.
   */
  async getBoard(actor: SprintActor, date?: string): Promise<SprintBoardView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);
    const day = date ?? orgToday(this.clock.now());
    const asDate = parseDay(day);

    const [tasks, candidates] = await Promise.all([
      this.repository.findUserTasksForDay(workspaceId, userId, asDate),
      this.repository.findCarryCandidates(workspaceId, userId, asDate),
    ]);

    return {
      date: day,
      tasks: tasks.map((task) => this.toView(task)),
      carryCandidates: candidates.map((task) => this.toView(task)),
    };
  }

  // ---------------------------------------------------------------------------
  // U3 — POST /sprint/tasks
  // ---------------------------------------------------------------------------

  /**
   * Creates a task for the caller.
   *
   * When the task has an owner, the task and the request for the owner's approval mail are
   * written in **one transaction** (DS-02.1), so a task never exists without its mail request.
   */
  async createTask(
    actor: SprintActor,
    input: {
      title: string;
      description: string;
      date: string;
      plannedHours: number;
      actualHours?: number;
      blocker?: string;
      category?: TaskCategoryValue;
      ownerId?: string;
    },
  ): Promise<SprintTaskView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    // A category and an owner go together (DS-01.3, E2). The database checks it too.
    // This is checked before anything is looked up: it is a fact about the request itself.
    const hasCategory = input.category !== undefined;
    const hasOwner = input.ownerId !== undefined;
    if (hasCategory !== hasOwner) {
      throw new SprintError(
        'CATEGORY_OWNER_MISMATCH',
        'A task has either both a category and an owner, or neither',
      );
    }

    await this.assertUserCanWrite(workspaceId, userId);

    let owner: { id: string; name: string; kind: string; email: string; isActive: boolean } | null = null;
    if (input.ownerId !== undefined) {
      owner = await this.repository.findOwner(workspaceId, input.ownerId);
      if (!owner) {
        throw new SprintError('NOT_FOUND', 'No such task owner');
      }
      if (!owner.isActive) {
        throw new SprintError('OWNER_INACTIVE', 'That task owner is not active');
      }
      if (owner.kind !== input.category) {
        throw new SprintError(
          'CATEGORY_OWNER_MISMATCH',
          'That task owner does not verify tasks of this category',
        );
      }
    }

    const needsVerification = owner !== null;
    const now = this.clock.now();

    const created = await this.repository.transaction(async (tx) => {
      const task = await tx.sprintTask.create({
        data: {
          workspaceId,
          userId,
          date: parseDay(input.date),
          title: input.title,
          description: input.description,
          plannedHours: input.plannedHours,
          actualHours: input.actualHours ?? 0,
          blocker: input.blocker ?? '',
          category: input.category ?? null,
          ownerId: owner?.id ?? null,
          verification: needsVerification ? 'PENDING' : null,
          ownerRequestedAt: needsVerification ? now : null,
          carriedFromId: null,
        },
        select: SprintRepository.taskSelect,
      });

      if (owner) {
        await this.approvalMail.requestOwnerApproval(tx, {
          workspaceId,
          sprintTaskId: task.id,
          recipient: owner.email,
          subject: 'Please verify a sprint task',
          body: this.approvalMailBody(task.title),
        });
      }

      return task;
    });

    return this.toView(created as TaskRow);
  }

  // ---------------------------------------------------------------------------
  // U4 — PATCH /sprint/tasks/:id
  // ---------------------------------------------------------------------------

  /**
   * Updates one of the caller's own tasks.
   *
   * A task of another user is **not found**, not "forbidden": the caller must not even learn
   * that the task exists (PRD BR-08).
   */
  async updateTask(
    actor: SprintActor,
    taskId: string,
    input: {
      title?: string;
      description?: string;
      plannedHours?: number;
      actualHours?: number;
      blocker?: string;
      done?: boolean;
    },
  ): Promise<SprintTaskView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const task = await this.repository.findOwnTask(workspaceId, userId, taskId);
    if (!task) {
      throw new SprintError('NOT_FOUND', 'No such task');
    }

    const updated = await this.repository.updateTask(taskId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.plannedHours !== undefined ? { plannedHours: input.plannedHours } : {}),
      ...(input.actualHours !== undefined ? { actualHours: input.actualHours } : {}),
      ...(input.blocker !== undefined ? { blocker: input.blocker } : {}),
      ...(input.done !== undefined ? { done: input.done } : {}),
    });

    return this.toView(updated as TaskRow);
  }

  // ---------------------------------------------------------------------------
  // U5 — DELETE /sprint/tasks/:id
  // ---------------------------------------------------------------------------

  /**
   * Soft-deletes one of the caller's own tasks (PRD BR-09).
   *
   * The row stays, so the history of the day keeps its shape; `deletedAt` marks it gone and it
   * never shows up on the board, in the history, on the sheet or in a report.
   */
  async deleteTask(actor: SprintActor, taskId: string): Promise<void> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const task = await this.repository.findOwnTask(workspaceId, userId, taskId);
    if (!task) {
      throw new SprintError('NOT_FOUND', 'No such task');
    }

    await this.repository.softDeleteTask(taskId, this.clock.now());
  }

  // ---------------------------------------------------------------------------
  // U6 — POST /sprint/carry-forward
  // ---------------------------------------------------------------------------

  /**
   * Carries the previous working day's open tasks to `date`.
   *
   * **Idempotent** (DS-04.4): a task that was already carried forward is not carried again, so
   * calling this twice on the same day creates nothing the second time.
   *
   * The previous working day skips Friday and Saturday and any public holiday (PRD BR-02).
   * When there is no previous working day, the answer is an empty list (E4).
   */
  async carryForward(actor: SprintActor, date: string): Promise<{ carried: SprintTaskView[] }> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    await this.assertUserCanWrite(workspaceId, userId);

    const target = parseDay(date);

    return this.repository.transaction(async (tx) => {
      const previousDay = await this.calendar.previousWorkingDay(tx, workspaceId, date);
      if (!previousDay) {
        return { carried: [] };
      }

      const previousDate = parseDay(previousDay);
      // Only the tasks that are still open **and** that were not carried forward already. The
      // "not carried already" part is in the query, not in a filter here: the copy lives on the
      // target day, so a filter on the previous day's rows would not see it and a second call
      // would copy the same source task twice.
      const candidates = await this.repository.findCarryCandidatesTx(
        tx,
        workspaceId,
        userId,
        previousDate,
      );

      const carried: TaskRow[] = [];
      for (const task of candidates) {
        // The copy is written in a **savepoint**, so that one refused copy does not undo the
        // copies that already succeeded. The unique index on `carriedFromId` is what refuses
        // the second copy of the same source task: two requests at the same moment (a double
        // click, two tabs) both read the same open task, and the index — not a check that ran
        // a moment earlier — decides which one wins. The loser simply carries that task on
        // another request, and the answer says so by leaving it out.
        const copy = await this.repository.copyTaskIfNotCarried(tx, {
          workspaceId,
          userId,
          date: target,
          source: task,
        });
        if (copy) {
          carried.push(copy as TaskRow);
        }
      }

      return { carried: carried.map((task) => this.toView(task)) };
    });
  }

  // ---------------------------------------------------------------------------
  // U7 — POST /sprint/submit
  // ---------------------------------------------------------------------------

  /**
   * Submits the caller's sprint for today.
   *
   * **The on-time flag is frozen here** (PRD BR-05). It is decided against the cutoff that was
   * in force at this instant — `XpRule.sprintCutoff`, read at submit time — and stored in
   * `SprintSubmission.onTime`. Changing the cutoff later never changes an old row.
   *
   * **One submission per user per day** (PRD BR-06). The `@@unique([userId, date])` index
   * refuses a second one, and that refusal is turned into a 409 `ALREADY_SUBMITTED` — not a
   * 500. A second submit is a conflict the caller can understand, not a crash.
   *
   * **The XP award is inside the submission's transaction** (DS-03.6). The award goes through
   * the `XpLedgerPort`, never straight to E09's `XpEvent` table (architecture.md section 3.3,
   * rule 5). A rolled-back submission therefore awards no XP, and a committed one always does:
   * the two cannot disagree.
   *
   * **Submit is always allowed** (OQ-4, SRS DS-03.8): a day with no tasks, a weekend, a second
   * attempt — the first two submit fine, the third is a 409. Nothing blocks a submission.
   */
  async submitSprint(actor: SprintActor): Promise<SprintSubmissionView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    // An archived user submits nothing (SRS E-25). Their history stays readable.
    await this.assertUserCanWrite(workspaceId, userId);

    const now = this.clock.now();
    const day = orgToday(now);

    // The rules of the workspace: the cutoff decides on-time, the amount decides the XP.
    // `XpRule` belongs to E09; reading it is allowed, writing it is not (rule 5).
    const rule = await this.repository.findXpRule(workspaceId);
    const cutoff = rule?.sprintCutoff ?? DEFAULT_SPRINT_CUTOFF;
    const xpAmount = rule?.onTimeSprint ?? DEFAULT_ON_TIME_SPRINT_XP;

    // Strictly before the cutoff: 09:59 is on time for a 10:00 cutoff, 10:00 is not.
    const onTime = isBeforeCutoff(now, cutoff);

    const submission = await this.repository.transaction(async (tx) => {
      try {
        const created = await this.repository.createSubmissionTx(tx, {
          workspaceId,
          userId,
          date: parseDay(day),
          submittedAt: now,
          onTime,
        });

        if (onTime) {
          await this.xpLedger.awardOnTimeSprint(tx, {
            workspaceId,
            userId,
            day,
            amount: xpAmount,
            submissionId: created.id,
          });
        }

        return created;
      } catch (error) {
        throw this.asSubmissionConflict(error);
      }
    });

    return {
      date: this.dayOf(submission.date),
      submittedAt: submission.submittedAt.toISOString(),
      onTime: submission.onTime,
      xpAwarded: onTime ? xpAmount : 0,
    };
  }

  /**
   * Turns the database's "one submission per day" refusal into a 409.
   *
   * The unique index on `[userId, date]` is what enforces one submission per day (PRD BR-06).
   * When it fires, the caller already submitted today, so the answer is a conflict they can
   * act on. Any other database failure is left alone — it is a real error and must not be
   * dressed up as a conflict.
   *
   * The check is on the error's `code`, the way E01's `isUniqueViolation` does it, so it works
   * for the error Prisma raises without depending on its class.
   */
  private asSubmissionConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      throw new SprintError(
        'ALREADY_SUBMITTED',
        'You have already submitted your sprint for today',
      );
    }
    throw error;
  }

  // ---------------------------------------------------------------------------
  // U8 — GET /sprint/summary
  // ---------------------------------------------------------------------------

  /**
   * The two-week summary of the caller's own sprint.
   *
   * The window is the last fourteen org days, ending today. A day with no task and no
   * submission still appears, with its figures marked **missing** rather than zero (NFR-09).
   */
  async getSummary(actor: SprintActor): Promise<SprintSummaryView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const today = orgToday(this.clock.now());
    const from = addDays(today, -13);
    const fromDate = parseDay(from);
    const toDate = parseDay(today);

    const [tasks, submissions] = await Promise.all([
      this.repository.findUserTasksBetween(workspaceId, userId, fromDate, toDate),
      this.repository.findUserSubmissionsBetween(workspaceId, userId, fromDate, toDate),
    ]);

    const submissionByDay = new Map<string, { onTime: boolean }>();
    for (const submission of submissions) {
      submissionByDay.set(this.dayOf(submission.date), { onTime: submission.onTime });
    }

    const tasksByDay = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const day = this.dayOf(task.date);
      const list = tasksByDay.get(day) ?? [];
      list.push(task as TaskRow);
      tasksByDay.set(day, list);
    }

    const days = [];
    for (let offset = 0; offset < 14; offset += 1) {
      const day = addDays(from, offset);
      const dayTasks = tasksByDay.get(day) ?? [];
      const submission = submissionByDay.get(day);
      days.push({
        date: day,
        submitted: submission !== undefined,
        onTime: submission ? submission.onTime : null,
        plannedHours: dayTasks.length
          ? present(dayTasks.reduce((sum, task) => sum + toNumber(task.plannedHours), 0))
          : missing(),
        actualHours: dayTasks.length
          ? present(dayTasks.reduce((sum, task) => sum + toNumber(task.actualHours), 0))
          : missing(),
        taskCount: dayTasks.length ? present(dayTasks.length) : missing(),
      });
    }

    return { from, to: today, days };
  }

  // ---------------------------------------------------------------------------
  // U9 — GET /sprint/history?cursor=&limit=
  // ---------------------------------------------------------------------------

  /**
   * The caller's sprint history, newest day first, one page at a time.
   *
   * The cursor is a day: the next page starts at the day **before** the last one of this page.
   * A day with no submission is still listed when it has tasks, so the history is the history of
   * the days the caller worked, not only the days they submitted.
   */
  async getHistory(
    actor: SprintActor,
    query: { cursor?: string; limit?: number },
  ): Promise<SprintHistoryView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);
    const limit = query.limit ?? 20;
    const cursorDate = query.cursor ? parseDay(query.cursor) : null;

    const submissions = await this.repository.findUserSubmissionsPage(
      workspaceId,
      userId,
      cursorDate,
      limit,
    );

    const days = submissions.map((submission) => this.dayOf(submission.date));
    const tasks = days.length
      ? await this.repository.findUserTasksBetween(
          workspaceId,
          userId,
          parseDay(days[days.length - 1]),
          parseDay(days[0]),
        )
      : [];

    const tasksByDay = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const day = this.dayOf(task.date);
      const list = tasksByDay.get(day) ?? [];
      list.push(task as TaskRow);
      tasksByDay.set(day, list);
    }

    const data: SprintHistoryItem[] = submissions.map((submission) => {
      const day = this.dayOf(submission.date);
      const dayTasks = tasksByDay.get(day) ?? [];
      return {
        date: day,
        taskCount: dayTasks.length ? present(dayTasks.length) : missing(),
        plannedHours: dayTasks.length
          ? present(dayTasks.reduce((sum, task) => sum + toNumber(task.plannedHours), 0))
          : missing(),
        actualHours: dayTasks.length
          ? present(dayTasks.reduce((sum, task) => sum + toNumber(task.actualHours), 0))
          : missing(),
        submitted: true,
        onTime: submission.onTime,
      };
    });

    const last = submissions[submissions.length - 1];
    const nextCursor =
      submissions.length === limit && last ? this.dayOf(last.date) : null;

    return { data, meta: { nextCursor } };
  }

  // ---------------------------------------------------------------------------
  // U10 — GET /sprint/meeting
  // ---------------------------------------------------------------------------

  /**
   * The next meeting of a team the caller is in, for the banner (DS-08).
   *
   * "Upcoming" means the next meeting whose time has not passed yet (E7). When there is no
   * meeting, `meeting` is `null` — the UI simply shows no banner.
   */
  async getMeetingBanner(actor: SprintActor): Promise<SprintMeetingBannerView> {
    const userId = userIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const meeting = await this.repository.findNextMeeting(
      workspaceId,
      userId,
      this.clock.now(),
    );
    if (!meeting) {
      return { meeting: null };
    }

    const local = toOrgLocal(meeting.scheduledAt);
    return {
      meeting: {
        id: meeting.id,
        title: meeting.title,
        date: local.day,
        time: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
        teamsLink: meeting.teamsLink,
        source: meeting.source,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Refuses an archived user (SRS E-25).
   *
   * An archived user creates no new tasks and carries nothing forward. Their history stays
   * readable, so this check is only on the paths that write.
   */
  private async assertUserCanWrite(workspaceId: string, userId: string): Promise<void> {
    const user = await this.repository.findUser(workspaceId, userId);
    if (!user) {
      throw new SprintError('NOT_FOUND', 'No such user');
    }
    if (user.archivedAt) {
      throw new SprintError('USER_ARCHIVED', 'This account is archived');
    }
  }

  /** The org day of a date column, 'YYYY-MM-DD'. */
  private dayOf(date: Date): DayString {
    return date.toISOString().slice(0, 10);
  }

  /** The plain-text body of the owner's approval mail. */
  private approvalMailBody(title: string): string {
    return `The task "${title}" is waiting for your answer.`;
  }

  /** Turns a task row into the shape the API answers with. */
  private toView(task: TaskRow): SprintTaskView {
    return {
      id: task.id,
      date: this.dayOf(task.date),
      title: task.title,
      description: task.description,
      plannedHours: toNumber(task.plannedHours),
      actualHours: toNumber(task.actualHours),
      blocker: task.blocker,
      done: task.done,
      category: (task.category as TaskCategoryValue | null) ?? null,
      ownerId: task.ownerId,
      ownerName: task.owner?.name ?? null,
      verification: (task.verification as SprintTaskView['verification']) ?? null,
      carriedFromId: task.carriedFromId,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
