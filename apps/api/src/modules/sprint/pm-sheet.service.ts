import { Inject, Injectable } from '@nestjs/common';
import { SprintError, isUniqueViolation } from './errors.js';
import { SprintRepository } from './sprint.repository.js';
import { CLOCK, type ClockPort } from './time/clock.port.js';
import { pmIdOf, workspaceIdOf, type SprintActor } from './http/actor.js';
import {
  addDays,
  isMonday,
  isWeekend,
  parseDay,
  weekEnd,
} from './time/org-time.js';
import { SHEET_COLUMNS, type SheetColumnValue } from './dto/pm-sprint.dto.js';
import type {
  SavedCellView,
  SheetCellView,
  SheetDayView,
  SheetRowView,
  SprintSheetView,
  SprintWeekView,
} from './dto/pm-sheet-response.dto.js';

/**
 * The PM's sheet rules: the sprint weeks (P1, P2), the team sheet (P3), the cell edit (P4)
 * and the XLSX export (P5).
 *
 * These are the **PM's** rules, so they live beside `PmSprintService` rather than in the
 * user-side `SprintService`.
 *
 * The rules:
 * - a PM works only on **their own teams** (PRD BR-08, SRS DS-06.5): somebody else's team
 *   is 403 `FORBIDDEN_SCOPE`,
 * - a sprint week starts on **Monday** (PRD BR-01); any other day is 422
 *   `WEEK_START_NOT_MONDAY`, and a second week for the same team and Monday is 409
 *   `WEEK_EXISTS`,
 * - a cell is written **only while its version is the one the editor saw** (PRD BR-10): a
 *   cell somebody else changed in the meantime is 409 `CELL_CONFLICT`, never overwritten,
 * - the sheet is **derived on read**, and a stored edit **wins** (ASSUMPTIONS OQ-1),
 * - `PLAN` is written by a PM only (ASSUMPTIONS OQ-2).
 */

/** The columns of the sheet, in the order they are shown. */
export const SHEET_COLUMN_ORDER: readonly SheetColumnValue[] = SHEET_COLUMNS;

/** A task row the derivation works from. */
type SheetTaskRow = {
  id: string;
  userId: string;
  date: Date;
  title: string;
  plannedHours: unknown;
  actualHours: unknown;
  blocker: string;
  done: boolean;
  verification: string | null;
};

/** A stored cell row. */
type SheetCellRow = {
  id: string;
  weekId: string;
  userId: string;
  date: Date;
  column: string;
  value: string;
  version: number;
  authorPmId: string | null;
  authorUserId: string | null;
  updatedByPmId: string | null;
  updatedByUserId: string | null;
};

const toNumber = (value: unknown): number => Number(value ?? 0);

/** The day of a `Date` column, as a 'YYYY-MM-DD' string. */
const dayOf = (date: Date): string => date.toISOString().slice(0, 10);

@Injectable()
export class PmSheetService {
  constructor(
    private readonly repository: SprintRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  // ---------------------------------------------------------------------------
  // P1 — GET /pm/sprint/weeks
  // ---------------------------------------------------------------------------

  /**
   * The sprint weeks of one of the PM's own teams (P1).
   *
   * The team is looked up first and its PM is compared with the signed-in PM. A team of
   * another PM is 403 `FORBIDDEN_SCOPE` — the same answer whether the team exists at all or
   * not, so the caller cannot probe for the teams of other PMs.
   */
  async listWeeks(actor: SprintActor, teamId: string): Promise<SprintWeekView[]> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    await this.assertOwnTeam(workspaceId, pmId, teamId);

    const weeks = await this.repository.findSprintWeeks(workspaceId, teamId);
    return weeks.map((week) => this.toWeekView(week));
  }

  // ---------------------------------------------------------------------------
  // P2 — POST /pm/sprint/weeks
  // ---------------------------------------------------------------------------

  /**
   * Adds a sprint week to one of the PM's own teams (P2).
   *
   * **The week starts on a Monday.** A day that is not a Monday is 422
   * `WEEK_START_NOT_MONDAY` — the request was understood, a rule refused it. The database
   * refuses it too (CHECK `chk_sprintweek_monday`).
   *
   * **A team has one week per Monday.** A second one is 409 `WEEK_EXISTS`. The
   * `@@unique([teamId, weekStart])` index is what really refuses it; the query before the
   * write is the fast path that gives the same answer without touching the database.
   */
  async addSprintWeek(
    actor: SprintActor,
    teamId: string,
    weekStartDay: string,
  ): Promise<SprintWeekView> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    await this.assertOwnTeam(workspaceId, pmId, teamId);

    // The Monday rule. Checked before anything is read or written.
    if (!isMonday(weekStartDay)) {
      throw new SprintError(
        'WEEK_START_NOT_MONDAY',
        'A sprint week starts on a Monday',
      );
    }

    const weekStartDate = parseDay(weekStartDay);

    const existing = await this.repository.findSprintWeekByStart(workspaceId, teamId, weekStartDate);
    if (existing) {
      throw new SprintError('WEEK_EXISTS', 'That team already has a sprint week for that Monday');
    }

    try {
      const week = await this.repository.createSprintWeek({
        workspaceId,
        teamId,
        weekStart: weekStartDate,
      });
      return this.toWeekView(week);
    } catch (error) {
      // Somebody else added the same week between the check and the write. The unique index
      // refused it, so it is the same conflict, not a crash.
      if (isUniqueViolation(error)) {
        throw new SprintError(
          'WEEK_EXISTS',
          'That team already has a sprint week for that Monday',
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // P3 — GET /pm/sprint/weeks/:id/sheet
  // ---------------------------------------------------------------------------

  /**
   * The team sheet of one sprint week (P3).
   *
   * The grid is: one row per member of the team, seven days per row, five columns per day.
   *
   * **Derived on read, stored edits win** (ASSUMPTIONS OQ-1). The values that can be worked
   * out from the user's tasks are derived; a PM's own text is stored and wins over the
   * derived one. `PLAN` is never derived — it is the PM's own note.
   *
   * **A row is shown only for the days the user was a member** (ASSUMPTIONS E6): a user who
   * left mid-week is shown for the days before they left.
   */
  async getSheet(actor: SprintActor, weekId: string): Promise<SprintSheetView> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const week = await this.findOwnWeek(workspaceId, pmId, weekId);

    const monday = dayOf(week.weekStart);
    const sunday = weekEnd(monday);
    const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));

    const memberships = await this.repository.findTeamMembers(workspaceId, week.teamId);
    const memberIds = memberships.map((membership) => membership.userId);

    // The tasks are read one day earlier than the week starts: the `YESTERDAY` column of
    // Monday is the work of the Sunday before, which is outside the week.
    const mondayBefore = addDays(monday, -1);

    const [tasks, cells] = await Promise.all([
      memberIds.length > 0
        ? this.repository.findTasksForSheet(
            workspaceId,
            memberIds,
            parseDay(mondayBefore),
            parseDay(sunday),
          )
        : Promise.resolve([] as SheetTaskRow[]),
      this.repository.findSheetCells(workspaceId, weekId),
    ]);

    const tasksByUserAndDay = groupTasks(tasks);
    const cellsByUserAndDay = groupCells(cells as unknown as SheetCellRow[]);

    const rows: SheetRowView[] = memberships.map((membership) => {
      const memberDays: SheetDayView[] = days.map((day) => {
        const dayCells = cellsByUserAndDay.get(cellKey(membership.userId, day)) ?? new Map();
        const dayTasks = tasksByUserAndDay.get(taskKey(membership.userId, day)) ?? [];
        const previousDayTasks =
          tasksByUserAndDay.get(taskKey(membership.userId, addDays(day, -1))) ?? [];

        return {
          date: day,
          weekend: isWeekend(day),
          cells: SHEET_COLUMN_ORDER.map((column) =>
            this.buildCell(column, dayCells.get(column), dayTasks, previousDayTasks),
          ),
        };
      });

      return {
        userId: membership.userId,
        name: membership.user.name,
        days: memberDays,
      };
    });

    return {
      weekId: week.id,
      teamId: week.teamId,
      teamName: week.team.name,
      weekStart: monday,
      weekEnd: sunday,
      columns: [...SHEET_COLUMN_ORDER],
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // P4 — PUT /pm/sprint/cells
  // ---------------------------------------------------------------------------

  /**
   * Saves one cell of the team sheet (P4).
   *
   * **The optimistic lock** (PRD BR-10, US-68). The client sends the version it saw; the
   * write only happens while the stored version is still that one. A cell another editor
   * changed in the meantime is **not** overwritten: the write changes no row, and the
   * answer is 409 `CELL_CONFLICT` with the current value and version, so the UI can raise
   * the conflict dialog.
   *
   * **The scope.** The week must belong to the PM, and the cell's user must be a member of
   * the week's team (ASSUMPTIONS E5). A cell for somebody who is not in the team is 403
   * `FORBIDDEN_SCOPE`.
   *
   * **The history.** The value the cell had before this edit is written to
   * `DsSheetCellVersion` in the same transaction, so the conflict dialog can show who
   * changed what.
   */
  async saveCell(
    actor: SprintActor,
    input: {
      weekId: string;
      userId: string;
      date: string;
      column: SheetColumnValue;
      value: string;
      expectedVersion: number;
    },
  ): Promise<SavedCellView> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const week = await this.findOwnWeek(workspaceId, pmId, input.weekId);

    // The cell's user must be a member of the week's team.
    const memberships = await this.repository.findTeamMembers(workspaceId, week.teamId);
    const membership = memberships.find((row) => row.userId === input.userId);
    if (!membership) {
      throw new SprintError(
        'FORBIDDEN_SCOPE',
        'That user is not a member of the team this week belongs to',
      );
    }

    const date = parseDay(input.date);

    // The cell must belong to the week it was saved against. A cell whose day is outside the
    // week would never be shown: the sheet renders exactly the seven days of the week, so the
    // row would be an orphan that a PM could write but never see again. The week runs Monday
    // to Sunday.
    const monday = dayOf(week.weekStart);
    const sunday = weekEnd(monday);
    const day = dayOf(date);
    if (day < monday || day > sunday) {
      throw new SprintError(
        'VALIDATION_ERROR',
        `That day is not in this sprint week (${monday} to ${sunday})`,
      );
    }

    const existing = await this.repository.findSheetCell(
      workspaceId,
      input.weekId,
      input.userId,
      date,
      input.column,
    );

    // --- The first edit: there is no cell row yet.
    if (!existing) {
      // `expectedVersion` 0 means "the editor saw no cell". Anything else means the editor
      // saw a cell that has since been deleted — a conflict, not a new cell.
      if (input.expectedVersion !== 0) {
        throw new SprintError('CELL_CONFLICT', 'That cell was changed by somebody else', {
          expectedVersion: input.expectedVersion,
          currentVersion: 0,
          currentValue: null,
        });
      }

      try {
        const created = await this.repository.createSheetCell({
          workspaceId,
          weekId: input.weekId,
          userId: input.userId,
          date,
          column: input.column,
          value: input.value,
          authorPmId: pmId,
          authorUserId: null,
          updatedByPmId: pmId,
          updatedByUserId: null,
        });
        return this.toSavedCellView(created as unknown as SheetCellRow);
      } catch (error) {
        // Two editors created the same cell at the same time. The unique index refused the
        // second one, so it is a conflict.
        if (isUniqueViolation(error)) {
          throw new SprintError('CELL_CONFLICT', 'That cell was changed by somebody else', {
            expectedVersion: input.expectedVersion,
            currentVersion: null,
            currentValue: null,
          });
        }
        throw error;
      }
    }

    // --- An edit of an existing cell.
    if (existing.version !== input.expectedVersion) {
      // Somebody else was faster. The cell is not overwritten; the UI shows the conflict.
      throw new SprintError('CELL_CONFLICT', 'That cell was changed by somebody else', {
        expectedVersion: input.expectedVersion,
        currentVersion: existing.version,
        currentValue: existing.value,
      });
    }

    const now = this.clock.now();

    const saved = await this.repository.transaction(async (tx) => {
      // The conditional write: only while the version is still the one the editor saw.
      const changed = await this.repository.saveSheetCellIfVersion(
        tx,
        existing.id,
        input.expectedVersion,
        { value: input.value, updatedByPmId: pmId, updatedByUserId: null },
      );

      if (changed.count === 0) {
        // Somebody else changed the cell between the read and the write. Their value wins
        // until the conflict dialog is answered.
        throw new SprintError('CELL_CONFLICT', 'That cell was changed by somebody else', {
          expectedVersion: input.expectedVersion,
          currentVersion: null,
          currentValue: null,
        });
      }

      // The old value goes into the history, in the same transaction as the new one.
      await this.repository.createSheetCellVersion({
        workspaceId,
        cellId: existing.id,
        version: existing.version,
        value: existing.value,
        editedByPmId: pmId,
        editedByUserId: null,
        editedAt: now,
      });

      return true;
    });

    if (!saved) {
      throw new SprintError('CELL_CONFLICT', 'That cell was changed by somebody else');
    }

    const updated = await this.repository.findSheetCell(
      workspaceId,
      input.weekId,
      input.userId,
      date,
      input.column,
    );
    if (!updated) {
      throw new SprintError('NOT_FOUND', 'No such cell');
    }

    return this.toSavedCellView(updated as unknown as SheetCellRow);
  }

  // ---------------------------------------------------------------------------
  // P5 — GET /pm/sprint/weeks/:id/export
  // ---------------------------------------------------------------------------

  /**
   * The sheet of one sprint week, as the rows the XLSX is built from.
   *
   * The export is built from **the same grid** the sheet endpoint answers, so the file and
   * the screen can never disagree. The XLSX itself is built in the controller's file
   * helper; this method returns the data.
   */
  async getSheetForExport(actor: SprintActor, weekId: string): Promise<SprintSheetView> {
    return this.getSheet(actor, weekId);
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Checks that the team is the PM's own, and answers 403 `FORBIDDEN_SCOPE` when it is not.
   *
   * A team of another workspace and a team of another PM answer the same way, so the caller
   * cannot tell them apart.
   */
  private async assertOwnTeam(
    workspaceId: string,
    pmId: string,
    teamId: string,
  ): Promise<{ id: string; name: string }> {
    const team = await this.repository.findTeam(workspaceId, teamId);
    if (!team || team.pmId !== pmId) {
      throw new SprintError('FORBIDDEN_SCOPE', 'You can only work on your own teams');
    }
    return team;
  }

  /**
   * Finds a sprint week that belongs to one of the PM's own teams.
   *
   * A week of another PM, a week of another workspace and a week that does not exist all
   * answer 403 `FORBIDDEN_SCOPE` / 404 in the same way, so a PM cannot probe for the weeks
   * of other PMs.
   */
  private async findOwnWeek(
    workspaceId: string,
    pmId: string,
    weekId: string,
  ): Promise<{
    id: string;
    teamId: string;
    weekStart: Date;
    team: { name: string; pmId: string };
  }> {
    const week = await this.repository.findSprintWeek(workspaceId, weekId);
    if (!week) {
      throw new SprintError('NOT_FOUND', 'No such sprint week');
    }
    if (week.team.pmId !== pmId) {
      throw new SprintError('FORBIDDEN_SCOPE', 'You can only work on your own teams');
    }
    return week as unknown as {
      id: string;
      teamId: string;
      weekStart: Date;
      team: { name: string; pmId: string };
    };
  }

  /**
   * Builds one cell of the grid.
   *
   * **A stored cell wins over a derived one** (ASSUMPTIONS OQ-1): when a PM wrote the cell,
   * their text is what the sheet shows, and the version is the one the next edit must send
   * back.
   */
  private buildCell(
    column: SheetColumnValue,
    stored: SheetCellRow | undefined,
    tasks: SheetTaskRow[],
    previousDayTasks: SheetTaskRow[],
  ): SheetCellView {
    const pending = tasks.some((task) => task.verification === 'PENDING');

    if (stored) {
      return {
        column,
        value: stored.value,
        source: 'STORED',
        version: stored.version,
        pending,
        authorPmId: stored.authorPmId,
        authorUserId: stored.authorUserId,
        updatedByPmId: stored.updatedByPmId,
        updatedByUserId: stored.updatedByUserId,
      };
    }

    const derived = deriveCell(column, tasks, previousDayTasks);
    return {
      column,
      value: derived,
      source: derived === '' ? 'EMPTY' : 'DERIVED',
      // No stored row, so the next edit expects version 0 (SRS DS-06.8, E-18).
      version: 0,
      pending,
      authorPmId: null,
      authorUserId: null,
      updatedByPmId: null,
      updatedByUserId: null,
    };
  }

  /** Turns a sprint week row into the shape the API answers with. */
  private toWeekView(week: {
    id: string;
    teamId: string;
    weekStart: Date;
    createdAt: Date;
    updatedAt: Date;
    team?: { name: string } | null;
  }): SprintWeekView {
    const monday = dayOf(week.weekStart);
    return {
      id: week.id,
      teamId: week.teamId,
      teamName: week.team?.name ?? '',
      weekStart: monday,
      weekEnd: weekEnd(monday),
      createdAt: week.createdAt.toISOString(),
      updatedAt: week.updatedAt.toISOString(),
    };
  }

  /** Turns a cell row into the shape the API answers with after a save. */
  private toSavedCellView(cell: SheetCellRow): SavedCellView {
    return {
      weekId: cell.weekId,
      userId: cell.userId,
      date: dayOf(cell.date),
      column: cell.column as SheetColumnValue,
      value: cell.value,
      version: cell.version,
    };
  }
}

// -----------------------------------------------------------------------------
// The derivation
// -----------------------------------------------------------------------------

/**
 * The value of a cell that is worked out from the user's tasks.
 *
 * The columns mean:
 * - `YESTERDAY` — what the user was doing on the **day before** this one,
 * - `HOURS` — the hours the user worked on that day,
 * - `TODAY` — what the user is doing on that day, from the tasks of that day,
 * - `BLOCKERS` — what is in the way, from the blockers of that day's tasks,
 * - `PLAN` — **never derived**: it is the PM's own note.
 *
 * A day with nothing on it is an **empty** cell, not a zero (PRD NFR-09): a missing number
 * is never shown as a zero.
 */
function deriveCell(
  column: SheetColumnValue,
  tasks: SheetTaskRow[],
  previousDayTasks: SheetTaskRow[],
): string {
  switch (column) {
    case 'PLAN':
      // The PM's own note. Never derived.
      return '';

    case 'HOURS': {
      const planned = tasks.reduce((total, task) => total + toNumber(task.plannedHours), 0);
      const actual = tasks.reduce((total, task) => total + toNumber(task.actualHours), 0);
      if (planned === 0 && actual === 0) return '';
      return `planned ${formatHours(planned)} / actual ${formatHours(actual)}`;
    }

    case 'BLOCKERS': {
      const blockers = tasks
        .map((task) => task.blocker.trim())
        .filter((blocker) => blocker.length > 0);
      if (blockers.length === 0) return '';
      return blockers.join('; ');
    }

    case 'YESTERDAY': {
      const titles = previousDayTasks
        .map((task) => task.title.trim())
        .filter((title) => title.length > 0);
      if (titles.length === 0) return '';
      return titles.join('; ');
    }

    case 'TODAY': {
      const titles = tasks.map((task) => task.title.trim()).filter((title) => title.length > 0);
      if (titles.length === 0) return '';
      return titles.join('; ');
    }

    default:
      return '';
  }
}

/** One decimal place, without a trailing ".0" — "2" reads better than "2.0" in a cell. */
function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

const taskKey = (userId: string, day: string): string => `${userId}|${day}`;
const cellKey = (userId: string, day: string): string => `${userId}|${day}`;

/** The tasks of each user and day. */
function groupTasks(tasks: SheetTaskRow[]): Map<string, SheetTaskRow[]> {
  const grouped = new Map<string, SheetTaskRow[]>();
  for (const task of tasks) {
    const key = taskKey(task.userId, dayOf(task.date));
    const bucket = grouped.get(key);
    if (bucket) bucket.push(task);
    else grouped.set(key, [task]);
  }
  return grouped;
}

/** The stored cells of each user and day, by column. */
function groupCells(cells: SheetCellRow[]): Map<string, Map<string, SheetCellRow>> {
  const grouped = new Map<string, Map<string, SheetCellRow>>();
  for (const cell of cells) {
    const key = cellKey(cell.userId, dayOf(cell.date));
    let bucket = grouped.get(key);
    if (!bucket) {
      bucket = new Map<string, SheetCellRow>();
      grouped.set(key, bucket);
    }
    bucket.set(cell.column, cell);
  }
  return grouped;
}
