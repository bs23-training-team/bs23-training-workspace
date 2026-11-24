import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation } from './errors.js';
import type { Db } from './ports/db.js';
import type {
  Prisma,
  TaskCategory,
  TaskVerification,
} from '../../generated/prisma/client.js';

/**
 * The database queries of the sprint module.
 *
 * Everything that touches Prisma lives here, so the service holds the rules and this file holds
 * the SQL shape. A rule that must hold in the database (a deleted task never shows up, a task
 * belongs to its workspace) is written into the `where` clause here, not left to the caller.
 *
 * Every query is scoped by `workspaceId`. The workspace comes from `req.user`, never from the
 * request body (PRD EP-14).
 */
@Injectable()
export class SprintRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The handle to use: the client itself, or the transaction a service is inside. */
  get db(): Db {
    return this.prisma;
  }

  /** The handle to use inside a transaction. */
  get tx(): Db {
    return this.prisma;
  }

  /** The task columns the board and the history need. */
  static readonly taskSelect = {
    id: true,
    workspaceId: true,
    userId: true,
    date: true,
    title: true,
    description: true,
    plannedHours: true,
    actualHours: true,
    blocker: true,
    done: true,
    category: true,
    ownerId: true,
    verification: true,
    carriedFromId: true,
    ownerRequestedAt: true,
    createdAt: true,
    updatedAt: true,
    owner: { select: { name: true } },
  } as const;

  /** The user row of the caller, so the service can check the account is not archived. */
  findUser(workspaceId: string, userId: string) {
    return this.db.user.findFirst({
      where: { workspaceId, userId },
      select: { userId: true, name: true, resource: true, archivedAt: true },
    });
  }

  /** The active owners of the caller's workspace with the given kind. */
  findActiveOwners(workspaceId: string, kind: 'LND' | 'SBU') {
    return this.db.taskOwner.findMany({
      where: { workspaceId, kind, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, kind: true, email: true },
    });
  }

  /** One owner by id, inside the workspace. */
  findOwner(workspaceId: string, ownerId: string) {
    return this.db.taskOwner.findFirst({
      where: { id: ownerId, workspaceId },
      select: { id: true, name: true, kind: true, email: true, isActive: true },
    });
  }

  /** The caller's own tasks of one day, oldest first. A deleted task is never returned. */
  findUserTasksForDay(workspaceId: string, userId: string, date: Date) {
    return this.db.sprintTask.findMany({
      where: { workspaceId, userId, date, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SprintRepository.taskSelect,
    });
  }

  /** The caller's own tasks of one day, oldest first — inside a transaction. */
  findUserTasksForDayTx(tx: Db, workspaceId: string, userId: string, date: Date) {
    return tx.sprintTask.findMany({
      where: { workspaceId, userId, date, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SprintRepository.taskSelect,
    });
  }

  /**
   * The caller's own open tasks of one day — the candidates for a carry forward.
   *
   * A task that is done is not a candidate, and a task that was already carried forward is not
   * either: the carried copy points back at it through `carriedFromId`.
   */
  findCarryCandidates(workspaceId: string, userId: string, date: Date) {
    return this.db.sprintTask.findMany({
      where: {
        workspaceId,
        userId,
        date,
        deletedAt: null,
        done: false,
        carriedFromId: null,
        // A carried task is not carried again.
        sprintTasksAsCarriedFrom: { none: {} },
      },
      orderBy: { createdAt: 'asc' },
      select: SprintRepository.taskSelect,
    });
  }

  /** One of the caller's own tasks. A deleted task is not found. */
  findOwnTask(workspaceId: string, userId: string, taskId: string) {
    return this.db.sprintTask.findFirst({
      where: { id: taskId, workspaceId, userId, deletedAt: null },
      select: SprintRepository.taskSelect,
    });
  }

  /** Creates a task. */
  createTask(data: {
    workspaceId: string;
    userId: string;
    date: Date;
    title: string;
    description: string;
    plannedHours: number;
    actualHours: number;
    blocker: string;
    category: 'LND' | 'SBU' | null;
    ownerId: string | null;
    verification: 'PENDING' | null;
    ownerRequestedAt: Date | null;
    carriedFromId: string | null;
  }) {
    return this.db.sprintTask.create({
      data: {
        workspaceId: data.workspaceId,
        userId: data.userId,
        date: data.date,
        title: data.title,
        description: data.description,
        plannedHours: data.plannedHours,
        actualHours: data.actualHours,
        blocker: data.blocker,
        category: data.category,
        ownerId: data.ownerId,
        verification: data.verification,
        ownerRequestedAt: data.ownerRequestedAt,
        carriedFromId: data.carriedFromId,
      },
      select: SprintRepository.taskSelect,
    });
  }

  /** Updates the fields of a task that a user may change. */
  updateTask(taskId: string, data: {
    title?: string;
    description?: string;
    plannedHours?: number;
    actualHours?: number;
    blocker?: string;
    done?: boolean;
  }) {
    return this.db.sprintTask.update({
      where: { id: taskId },
      data,
      select: SprintRepository.taskSelect,
    });
  }

  /** Soft-deletes a task: the row stays, `deletedAt` marks it gone (PRD BR-09). */
  softDeleteTask(taskId: string, deletedAt: Date) {
    return this.db.sprintTask.update({
      where: { id: taskId },
      data: { deletedAt },
      select: SprintRepository.taskSelect,
    });
  }

  /** The caller's own tasks between two days, oldest first. */
  findUserTasksBetween(workspaceId: string, userId: string, from: Date, to: Date) {
    return this.db.sprintTask.findMany({
      where: { workspaceId, userId, deletedAt: null, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: SprintRepository.taskSelect,
    });
  }

  /** The caller's own submissions between two days. */
  findUserSubmissionsBetween(workspaceId: string, userId: string, from: Date, to: Date) {
    return this.db.sprintSubmission.findMany({
      where: { workspaceId, userId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
      select: { date: true, submittedAt: true, onTime: true },
    });
  }

  /** The caller's own submissions, newest day first, one page of the history. */
  findUserSubmissionsPage(workspaceId: string, userId: string, cursor: Date | null, take: number) {
    return this.db.sprintSubmission.findMany({
      where: {
        workspaceId,
        userId,
        ...(cursor ? { date: { lt: cursor } } : {}),
      },
      orderBy: { date: 'desc' },
      take,
      select: { date: true, submittedAt: true, onTime: true },
    });
  }

  /** The caller's own tasks of one day, inside a transaction. */
  findUserTasksOfDayTx(tx: Db, workspaceId: string, userId: string, date: Date) {
    return tx.sprintTask.findMany({
      where: { workspaceId, userId, date, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SprintRepository.taskSelect,
    });
  }

  /**
   * The tasks of one day that could still be carried forward, inside a transaction.
   *
   * A task is a candidate when it is **open** (`done = false`) and it has **not been carried
   * forward already** — neither as a copy itself (`carriedFromId IS NULL`) nor as the source of
   * a copy (`sprintTasksAsCarriedFrom: { none: {} }`).
   *
   * The second half matters: without it, calling carry-forward twice would copy the same
   * source task twice, because the copy lives on the **target** day while the source keeps
   * sitting on the previous day. The board's candidate list already applies this rule
   * (`findCarryCandidates`); the write path has to apply it too, or the two would disagree.
   */
  findCarryCandidatesTx(tx: Db, workspaceId: string, userId: string, date: Date) {
    return tx.sprintTask.findMany({
      where: {
        workspaceId,
        userId,
        date,
        deletedAt: null,
        done: false,
        carriedFromId: null,
        // A carried task is not carried again.
        sprintTasksAsCarriedFrom: { none: {} },
      },
      orderBy: { createdAt: 'asc' },
      select: SprintRepository.taskSelect,
    });
  }

  /**
   * Copies one open task to the target day — **at most once**.
   *
   * The idempotency of a carry forward (DS-04.4) is enforced by the **unique index** on
   * `carriedFromId`, not by a check that ran a moment earlier: two requests at the same
   * moment (a double click, two tabs) both read the same open task, and only the index can
   * decide which copy wins. A plain read-then-write would let both through.
   *
   * The insert is wrapped in a **savepoint**, so the unique violation rolls back only this
   * copy and leaves the copies that already succeeded in place. Without the savepoint the
   * whole transaction would be aborted by the failed insert.
   *
   * The method answers `null` when the task was carried by somebody else in the meantime:
   * the task is not carried twice, and the caller simply does not see it in the answer.
   */
  async copyTaskIfNotCarried(
    tx: Db,
    data: {
      workspaceId: string;
      userId: string;
      date: Date;
      source: {
        id: string;
        title: string;
        description: string;
        plannedHours: Prisma.Decimal | number | string;
        blocker: string;
        category: TaskCategory | null;
        ownerId: string | null;
        verification: TaskVerification | null;
        ownerRequestedAt: Date | null;
      };
    },
  ): Promise<unknown | null> {
    const copy = data.source;
    try {
      return await tx.$transaction(
        async (savepoint) =>
          savepoint.sprintTask.create({
            data: {
              workspaceId: data.workspaceId,
              userId: data.userId,
              date: data.date,
              title: copy.title,
              description: copy.description,
              plannedHours: copy.plannedHours,
              actualHours: 0,
              blocker: copy.blocker,
              category: copy.category,
              ownerId: copy.ownerId,
              // A carried task is not sent to the owner again: it is the same task.
              verification: copy.verification,
              ownerRequestedAt: copy.ownerRequestedAt,
              carriedFromId: copy.id,
            },
            select: SprintRepository.taskSelect,
          }),
        { isolationLevel: 'ReadCommitted' },
      );
    } catch (error) {
      // The unique index refused the copy: this task was carried forward already. That is the
      // idempotency rule working, not a failure, so the task is left out of the answer.
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * The sprint rules of the caller's own workspace.
   *
   * `XpRule` belongs to E09, so this is a **read** — allowed by architecture.md section 3.3,
   * rule 5. The row is missing until E09 seeds it, so the caller has to cope with `null`.
   */
  findXpRule(workspaceId: string) {
    return this.db.xpRule.findUnique({
      where: { workspaceId },
      select: { sprintCutoff: true, onTimeSprint: true },
    });
  }

  /** The caller's own submission of one day, if there is one. */
  findSubmission(workspaceId: string, userId: string, date: Date) {
    return this.db.sprintSubmission.findUnique({
      where: { userId_date: { userId, date } },
      select: { id: true, date: true, submittedAt: true, onTime: true, workspaceId: true },
    });
  }

  /** Creates a submission. The `@@unique([userId, date])` index refuses a second one. */
  createSubmission(data: {
    workspaceId: string;
    userId: string;
    date: Date;
    submittedAt: Date;
    onTime: boolean;
  }) {
    return this.db.sprintSubmission.create({
      data: {
        workspaceId: data.workspaceId,
        userId: data.userId,
        date: data.date,
        submittedAt: data.submittedAt,
        onTime: data.onTime,
      },
      select: { id: true, date: true, submittedAt: true, onTime: true },
    });
  }

  /** Creates a submission inside a transaction, together with the XP award it triggers. */
  createSubmissionTx(
    tx: Db,
    data: {
      workspaceId: string;
      userId: string;
      date: Date;
      submittedAt: Date;
      onTime: boolean;
    },
  ) {
    return tx.sprintSubmission.create({
      data: {
        workspaceId: data.workspaceId,
        userId: data.userId,
        date: data.date,
        submittedAt: data.submittedAt,
        onTime: data.onTime,
      },
      select: { id: true, date: true, submittedAt: true, onTime: true },
    });
  }

  // ---------------------------------------------------------------------------
  // P7 — the PM records the owner's answer
  // ---------------------------------------------------------------------------

  /**
   * One task, with the PM who manages its owner, so the service can check the scope.
   *
   * The task is read together with the `pmId` of the user who owns it. The PM may record the
   * answer **only for their own users** (PRD BR-08, SRS DS-02.5), and that is decided from
   * this row: `user.pmId === pmId` means the task is the PM's to decide.
   *
   * A deleted task is not found: a task the user took back is not there to be decided.
   */
  findTaskForOwnerReply(workspaceId: string, taskId: string) {
    return this.db.sprintTask.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      select: {
        ...SprintRepository.taskSelect,
        user: { select: { pmId: true, name: true } },
        owner: { select: { name: true, email: true } },
      },
    });
  }

  /**
   * The task as it is right now, after the answer was recorded.
   */
  findTaskById(workspaceId: string, taskId: string) {
    return this.db.sprintTask.findFirst({
      where: { id: taskId, workspaceId },
      select: SprintRepository.taskSelect,
    });
  }

  /**
   * Records the owner's answer — **atomically, and only once**.
   *
   * This is the "decide once" rule (PRD BR-07, SRS F-06). The write is a single
   * `UPDATE ... WHERE verification = 'PENDING'`: two PMs pressing the button at the same
   * moment, or one PM pressing it twice, produce exactly one row changed. The second attempt
   * changes **no** row, and the service turns that into a 409 `ALREADY_DECIDED`.
   *
   * The write is not a plain `update`, because a plain update cannot express "only while it
   * is still pending" — it would overwrite a decision that was already made.
   *
   * `ownerRepliedAt` and `ownerReplyById` are set together with the new state, because the
   * database's own CHECK (`chk_task_reply_state`) requires a decided task to carry both
   * (F-06).
   */
  decideOwnerReply(
    tx: Db,
    taskId: string,
    data: { verification: 'VERIFIED' | 'NOT_CONFIRMED'; ownerRepliedAt: Date; ownerReplyById: string },
  ) {
    return tx.sprintTask.updateMany({
      where: { id: taskId, verification: 'PENDING' },
      data: {
        verification: data.verification,
        ownerRepliedAt: data.ownerRepliedAt,
        ownerReplyById: data.ownerReplyById,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // S1 — the no-reply job
  // ---------------------------------------------------------------------------

  /**
   * The workspaces that have at least one task waiting for its owner.
   *
   * The job runs for every workspace, because it is not called on behalf of anybody — it is
   * the system asking on its own. A workspace with nothing to escalate is not read at all.
   */
  findWorkspacesWithPendingTasks(askedBefore: Date) {
    return this.db.workspace.findMany({
      where: {
        sprintTasks: {
          some: {
            verification: 'PENDING',
            ownerRequestedAt: { lte: askedBefore },
            pendingAlertSentAt: null,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
  }

  /**
   * The tasks whose owner has not answered for a day, and that have not been escalated yet.
   *
   * The three conditions are the ones DS-09.1 names:
   * - the task is still `PENDING`,
   * - the owner was asked at least 24 hours ago,
   * - the PM has not been told yet (`pendingAlertSentAt IS NULL`).
   *
   * A deleted task is never escalated: it is gone, so nobody is waiting for it.
   *
   * The rows are locked with `FOR UPDATE SKIP LOCKED` so that two runs of the job at the same
   * time never pick up the same task (DS-09.3). The lock is taken by the raw statement below;
   * `skipLocked` is what makes the second run skip the rows the first one is holding.
   */
  async findStalePendingTasks(workspaceId: string, askedBefore: Date): Promise<
    Array<{
      id: string;
      userId: string;
      title: string;
      ownerId: string | null;
      ownerRequestedAt: Date | null;
      user: { pmId: string; name: string } | null;
      owner: { name: string; email: string } | null;
    }>
  > {
    return this.db.$queryRaw<
      Array<{
        id: string;
        userId: string;
        title: string;
        ownerId: string | null;
        ownerRequestedAt: Date | null;
        user: { pmId: string; name: string } | null;
        owner: { name: string; email: string } | null;
      }>
    >`
      SELECT t."id",
             t."userId",
             t."title",
             t."ownerId",
             t."ownerRequestedAt",
             json_build_object('pmId', u."pmId", 'name', u."name") AS "user",
             json_build_object('name', o."name", 'email', o."email") AS "owner"
      FROM "SprintTask" t
      JOIN "User" u ON u."userId" = t."userId"
      LEFT JOIN "TaskOwner" o ON o."id" = t."ownerId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t."verification" = 'PENDING'
        AND t."ownerRequestedAt" IS NOT NULL
        AND t."ownerRequestedAt" <= ${askedBefore}
        AND t."pendingAlertSentAt" IS NULL
        AND t."deletedAt" IS NULL
      ORDER BY t."ownerRequestedAt" ASC
      FOR UPDATE OF t SKIP LOCKED
    `;
  }

  /**
   * Marks that the PM was told about a task, so the job does not tell them twice.
   *
   * The write is `updateMany` with `pendingAlertSentAt IS NULL` in the `where`, so two runs
   * that picked up the same task still produce **one** alert: the second one changes no row
   * and the service skips the notice.
   */
  markPendingAlertSent(tx: Db, taskId: string, sentAt: Date) {
    return tx.sprintTask.updateMany({
      where: { id: taskId, pendingAlertSentAt: null, verification: 'PENDING' },
      data: { pendingAlertSentAt: sentAt },
    });
  }

  // ---------------------------------------------------------------------------
  // P1 / P2 — the sprint weeks
  // ---------------------------------------------------------------------------

  /**
   * A team, together with the PM who manages it.
   *
   * The PM who owns the team is the scope of every sheet: a PM may only work on the weeks of
   * their own teams (PRD BR-08, SRS DS-06.5). The scope is decided from the row, never from
   * anything the client sent.
   */
  findTeam(workspaceId: string, teamId: string) {
    return this.db.team.findFirst({
      where: { id: teamId, workspaceId },
      select: { id: true, name: true, pmId: true, archivedAt: true },
    });
  }

  /**
   * The sprint weeks of a team, newest first.
   *
   * The team is filtered by the workspace, so a team of another workspace is never reached
   * through a stale id.
   */
  findSprintWeeks(workspaceId: string, teamId: string) {
    return this.db.sprintWeek.findMany({
      where: { workspaceId, teamId },
      orderBy: { weekStart: 'desc' },
      select: {
        id: true,
        workspaceId: true,
        teamId: true,
        weekStart: true,
        createdAt: true,
        updatedAt: true,
        team: { select: { name: true } },
      },
    });
  }

  /**
   * One sprint week, together with its team.
   *
   * The week is filtered by the workspace, so a week of another workspace is not found.
   */
  findSprintWeek(workspaceId: string, weekId: string) {
    return this.db.sprintWeek.findFirst({
      where: { id: weekId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        teamId: true,
        weekStart: true,
        createdAt: true,
        updatedAt: true,
        team: { select: { name: true, pmId: true } },
      },
    });
  }

  /**
   * The sprint week of a team that starts on a given Monday.
   *
   * This is the check behind the `WEEK_EXISTS` conflict: the `@@unique([teamId, weekStart])`
   * index is what really refuses the second one, and this query is the fast path that gives
   * the same answer without touching the database.
   */
  findSprintWeekByStart(workspaceId: string, teamId: string, weekStart: Date) {
    return this.db.sprintWeek.findFirst({
      where: { workspaceId, teamId, weekStart },
      select: { id: true, weekStart: true },
    });
  }

  /** Creates a sprint week. The `@@unique([teamId, weekStart])` index refuses a second one. */
  createSprintWeek(data: { workspaceId: string; teamId: string; weekStart: Date }) {
    return this.db.sprintWeek.create({
      data: { workspaceId: data.workspaceId, teamId: data.teamId, weekStart: data.weekStart },
      select: {
        id: true,
        workspaceId: true,
        teamId: true,
        weekStart: true,
        createdAt: true,
        updatedAt: true,
        team: { select: { name: true } },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // P3 — the sheet
  // ---------------------------------------------------------------------------

  /**
   * The members of a team, with the day they joined and the day they left.
   *
   * `leftAt` is what decides whether a row is shown for a day (ASSUMPTIONS E6): a user who
   * left mid-week is shown only for the days they were a member.
   */
  findTeamMembers(workspaceId: string, teamId: string) {
    return this.db.membership.findMany({
      where: { workspaceId, teamId },
      orderBy: { userId: 'asc' },
      select: {
        userId: true,
        leftAt: true,
        createdAt: true,
        user: { select: { name: true, archivedAt: true } },
      },
    });
  }

  /**
   * The tasks of a set of users between two days, for the derived sheet values.
   *
   * A deleted task is never returned: a task the user took back is not on the sheet (PRD
   * BR-09).
   */
  findTasksForSheet(
    workspaceId: string,
    userIds: string[],
    from: Date,
    to: Date,
  ) {
    return this.db.sprintTask.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
        date: { gte: from, lte: to },
        deletedAt: null,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        userId: true,
        date: true,
        title: true,
        plannedHours: true,
        actualHours: true,
        blocker: true,
        done: true,
        verification: true,
      },
    });
  }

  /**
   * The stored cells of a week, for the rows that a PM has written.
   *
   * Only the stored cells are read: the derived ones are worked out from the tasks, not
   * stored (ASSUMPTIONS OQ-1: derive on read, stored edits win).
   */
  findSheetCells(workspaceId: string, weekId: string) {
    return this.db.dsSheetCell.findMany({
      where: { workspaceId, weekId },
      select: {
        id: true,
        weekId: true,
        userId: true,
        date: true,
        column: true,
        value: true,
        version: true,
        authorPmId: true,
        authorUserId: true,
        updatedByPmId: true,
        updatedByUserId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * One cell of the sheet, by its natural key.
   *
   * The key is `[weekId, userId, date, column]` — the same key the `@@unique` index uses, so
   * there is at most one cell for a day and a column.
   */
  findSheetCell(workspaceId: string, weekId: string, userId: string, date: Date, column: string) {
    return this.db.dsSheetCell.findFirst({
      where: { workspaceId, weekId, userId, date, column: column as never },
      select: {
        id: true,
        weekId: true,
        userId: true,
        date: true,
        column: true,
        value: true,
        version: true,
        authorPmId: true,
        authorUserId: true,
        updatedByPmId: true,
        updatedByUserId: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Writes a cell — **only while its version is the one the editor saw**.
   *
   * This is the optimistic lock of US-68 (PRD BR-10). The `where` carries the version the
   * editor sent, so a cell that another editor changed in the meantime is **not** overwritten:
   * the write changes no row, and the service turns that into a 409 `CELL_CONFLICT`.
   *
   * The write is not a plain `update`, because a plain update cannot express "only while it
   * is still at this version".
   */
  saveSheetCellIfVersion(
    tx: Db,
    cellId: string,
    expectedVersion: number,
    data: { value: string; updatedByPmId: string | null; updatedByUserId: string | null },
  ) {
    return tx.dsSheetCell.updateMany({
      where: { id: cellId, version: expectedVersion },
      data: {
        value: data.value,
        version: { increment: 1 },
        updatedByPmId: data.updatedByPmId,
        updatedByUserId: data.updatedByUserId,
      },
    });
  }

  /** Creates a cell. The `@@unique` index refuses a second cell for the same day and column. */
  createSheetCell(data: {
    workspaceId: string;
    weekId: string;
    userId: string;
    date: Date;
    column: string;
    value: string;
    authorPmId: string | null;
    authorUserId: string | null;
    updatedByPmId: string | null;
    updatedByUserId: string | null;
  }) {
    return this.db.dsSheetCell.create({
      data: {
        workspaceId: data.workspaceId,
        weekId: data.weekId,
        userId: data.userId,
        date: data.date,
        column: data.column as never,
        value: data.value,
        authorPmId: data.authorPmId,
        authorUserId: data.authorUserId,
        updatedByPmId: data.updatedByPmId,
        updatedByUserId: data.updatedByUserId,
      },
      select: {
        id: true,
        weekId: true,
        userId: true,
        date: true,
        column: true,
        value: true,
        version: true,
        authorPmId: true,
        authorUserId: true,
        updatedByPmId: true,
        updatedByUserId: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Records the value a cell had before this edit.
   *
   * `DsSheetCellVersion` is the history the conflict dialog shows: who changed what, and what
   * it was before (ASSUMPTIONS OQ-10, US-68).
   */
  createSheetCellVersion(data: {
    workspaceId: string;
    cellId: string;
    version: number;
    value: string;
    editedByPmId: string | null;
    editedByUserId: string | null;
    editedAt: Date;
  }) {
    return this.db.dsSheetCellVersion.create({
      data: {
        workspaceId: data.workspaceId,
        cellId: data.cellId,
        version: data.version,
        value: data.value,
        editedByPmId: data.editedByPmId,
        editedByUserId: data.editedByUserId,
        editedAt: data.editedAt,
      },
      select: { id: true, cellId: true, version: true, value: true, editedAt: true },
    });
  }

  /** The tasks of the caller's own teams' meetings: the next meeting from today on. */
  findNextMeeting(workspaceId: string, userId: string, from: Date) {
    return this.db.dsMeeting.findFirst({
      where: {
        workspaceId,
        scheduledAt: { gte: from },
        OR: [
          // A meeting of a team the user is in.
          { team: { memberships: { some: { userId, leftAt: null } } } },
          // A meeting with no team is for everybody.
          { teamId: null },
        ],
      },
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        teamsLink: true,
        source: true,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // P6 — the sprint report
  // ---------------------------------------------------------------------------

  /**
   * The users a PM manages, for a report that covers every team of that PM.
   *
   * The scope is `User.pmId === pmId` (ASSUMPTIONS D8): a PM sees their own people, and
   * nobody else's. Archived users are left out — an account that is closed is not part of a
   * report.
   */
  findReportUsers(workspaceId: string, pmId: string) {
    return this.db.user.findMany({
      where: { workspaceId, pmId, archivedAt: null },
      orderBy: { userId: 'asc' },
      select: { userId: true, name: true },
    });
  }

  /**
   * The members of one team, for a team report.
   *
   * The membership is **not** filtered by `leftAt` here: only the service knows the period of
   * the report, and a member who left **inside** the window still belongs to it. The member's
   * own `pmId` and `archivedAt` are selected so the service can apply the scope rule — a
   * member another PM manages is not in this PM's report (ASSUMPTIONS D8).
   */
  findReportTeamUsers(workspaceId: string, teamId: string) {
    return this.db.membership.findMany({
      where: { workspaceId, teamId },
      orderBy: { userId: 'asc' },
      select: {
        userId: true,
        leftAt: true,
        user: { select: { userId: true, name: true, pmId: true, archivedAt: true } },
      },
    });
  }

  /**
   * The tasks of the given users inside the window, for the report's hours and task count.
   *
   * A **deleted** task is never returned (ASSUMPTIONS D9): a deleted task is not work that
   * happened.
   */
  findReportTasks(workspaceId: string, userIds: string[], from: Date, to: Date) {
    return this.db.sprintTask.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
        date: { gte: from, lte: to },
        deletedAt: null,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        userId: true,
        date: true,
        plannedHours: true,
        actualHours: true,
        blocker: true,
      },
    });
  }

  /**
   * The submissions of the given users inside the window, for the report's day counts.
   *
   * A submission is never deleted, so there is no `deletedAt` filter here. The `onTime` flag
   * is the one frozen at the moment of submission (PRD BR-05).
   */
  findReportSubmissions(workspaceId: string, userIds: string[], from: Date, to: Date) {
    return this.db.sprintSubmission.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
      select: { userId: true, date: true, onTime: true },
    });
  }

  /** Runs `work` inside a transaction, so the task and the mail it asks for commit together. */
  transaction<T>(work: (tx: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => work(tx));
  }
}
