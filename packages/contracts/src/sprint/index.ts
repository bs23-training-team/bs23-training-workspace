// Owner: E06. Types shared by apps/api and apps/web for the sprint module.
// Already re-exported from src/index.ts: do not edit that file.
//
// Every type here is the **shared** vocabulary of the daily sprint module. The API's own
// request DTOs (the class-validator ones) stay in apps/api — a validation class cannot live
// in a shared type package — but everything the API **answers** is described here, so the web
// client and the API can never drift apart.
//
// ## The one rule the UI must not break
//
// **A missing value is never a zero** (PRD NFR-09). Every figure is a `SprintFigure`, which
// carries its own source: a number that is really zero and a number that is not known are
// different facts and they are different values here.
//
// ## The two calendars
//
// The module has **two** weeks and they are not the same:
//
// | | first day | last day | off days |
// |---|---|---|---|
// | the **sprint week** (the PM sheet, P1–P5) | Monday | Sunday | Friday and Saturday |
// | the **report week** (the report window, P6) | Sunday | Friday | Saturday only |
//
// A sprint week always starts on a Monday — the database refuses anything else. A report week
// exists only to say which days a report covers, so a report window can never move a sprint
// week. The UI must not assume one when it means the other.

// -----------------------------------------------------------------------------
// The figures
// -----------------------------------------------------------------------------

/** Where a number came from, so the UI can label it. */
export type SprintSource = 'TASK' | 'SUBMISSION' | 'DERIVED' | 'MISSING';

/**
 * A number that knows where it came from.
 *
 * `value` is `null` when the data is not there — and `source` is then `'MISSING'`. A `value` of
 * `0` with a real source is a **real zero**: the user had a task that was worth zero hours.
 * Never render a `null` value as `0`; show it as missing.
 */
export interface SprintFigure {
  value: number | null;
  source: SprintSource;
}

// -----------------------------------------------------------------------------
// The board (U2) and the tasks (U3, U4)
// -----------------------------------------------------------------------------

/** The kind of owner a task can be sent to. The same words as the `TaskCategory` enum. */
export const SPRINT_TASK_CATEGORIES = ['RND', 'SBU'] as const;
export type SprintTaskCategory = (typeof SPRINT_TASK_CATEGORIES)[number];

/** Where a task stands with its owner. Null when the task needs no verification. */
export type SprintVerification = 'PENDING' | 'VERIFIED' | 'NOT_CONFIRMED';

/** One task on the board. */
export interface SprintTaskView {
  id: string;
  /** The day the task belongs to, 'YYYY-MM-DD' in org time. */
  date: string;
  title: string;
  description: string;
  plannedHours: number;
  actualHours: number;
  blocker: string;
  done: boolean;
  /** 'RND' or 'SBU' for a task done for someone else; null for a task done for oneself. */
  category: SprintTaskCategory | null;
  /** The owner who has to verify the task; null for a task done for oneself. */
  ownerId: string | null;
  ownerName: string | null;
  /** Where the task stands with its owner; null when it needs no verification. */
  verification: SprintVerification | null;
  /** The id of the task this one was carried forward from, when it was. */
  carriedFromId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The board of one day. */
export interface SprintBoardView {
  /** The day the board shows, 'YYYY-MM-DD' in org time. */
  date: string;
  tasks: SprintTaskView[];
  /**
   * The tasks of the previous working day that are still open and have not been carried
   * forward yet. **Read-only**: the rows are created by `POST /sprint/carry-forward`, never
   * by reading the board.
   */
  carryCandidates: SprintTaskView[];
}

/** The owners that can be asked to verify a task. */
export interface TaskOwnerView {
  id: string;
  name: string;
  kind: SprintTaskCategory;
  email: string;
}

// -----------------------------------------------------------------------------
// The summary (U7) and the history (U9)
// -----------------------------------------------------------------------------

/** One day of the two-week summary. */
export interface SprintSummaryDay {
  date: string;
  /** True when the day was submitted. */
  submitted: boolean;
  /** True when the submission was before the cutoff. Null when the day was not submitted. */
  onTime: boolean | null;
  plannedHours: SprintFigure;
  actualHours: SprintFigure;
  taskCount: SprintFigure;
}

/** The two-week summary. */
export interface SprintSummaryView {
  /** The first day of the window, 'YYYY-MM-DD'. */
  from: string;
  /** The last day of the window, 'YYYY-MM-DD'. */
  to: string;
  days: SprintSummaryDay[];
}

/** One row of the history list. */
export interface SprintHistoryItem {
  date: string;
  taskCount: SprintFigure;
  plannedHours: SprintFigure;
  actualHours: SprintFigure;
  /** True when the day was submitted. */
  submitted: boolean;
  /** True when the submission was before the cutoff. Null when the day was not submitted. */
  onTime: boolean | null;
}

/** The history list, with its cursor. */
export interface SprintHistoryView {
  data: SprintHistoryItem[];
  meta: { nextCursor: string | null };
}

// -----------------------------------------------------------------------------
// The submit (U5) and the meeting banner (U10)
// -----------------------------------------------------------------------------

/**
 * The answer of `POST /sprint/submit`.
 *
 * The on-time flag is the one that was **frozen at the moment of submission**: it was decided
 * against the cutoff that was in force then, and changing the cutoff later never changes this
 * answer (PRD BR-05).
 */
export interface SprintSubmissionView {
  /** The day that was submitted, 'YYYY-MM-DD' in org time. */
  date: string;
  /** The instant of the submission, as an ISO timestamp in UTC. */
  submittedAt: string;
  /** True when the submission was strictly before the cutoff of that day. */
  onTime: boolean;
  /** The XP the submission earned, from `XpRule.onTimeSprint`. Zero when it was late. */
  xpAwarded: number;
}

/** The meeting banner's meeting. */
export interface SprintMeetingView {
  id: string;
  title: string;
  /** The day of the meeting, 'YYYY-MM-DD' in org time. */
  date: string;
  /** The local time of the meeting, 'HH:MM'. */
  time: string;
  /** The Teams link; https only. Null when the meeting has none. */
  teamsLink: string | null;
  /** Where the meeting came from: a Teams sync, the seed, ... */
  source: string | null;
}

/**
 * The answer of the meeting banner.
 *
 * The meeting is wrapped in an object rather than answered as a bare `null`, because a JSON body
 * of `null` is not something the client can tell apart from an empty body. `{ meeting: null }` is
 * unambiguous: there is no meeting.
 */
export interface SprintMeetingBannerView {
  meeting: SprintMeetingView | null;
}

// -----------------------------------------------------------------------------
// The report (P6)
// -----------------------------------------------------------------------------

/** The report periods a PM can ask for (P6, SRS DS-07). */
export const SPRINT_REPORT_TYPES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export type SprintReportType = (typeof SPRINT_REPORT_TYPES)[number];

/**
 * One user's row of a sprint report.
 *
 * Every figure is a `SprintFigure`, so the UI can tell a real zero from a value that is not
 * there: a user who worked no days in the period has **missing** hours, not zero hours. A user
 * who worked but logged no hours has a real zero.
 */
export interface SprintReportRow {
  /** The user's login id, e.g. "BS23001". */
  userId: string;
  /** The user's name. */
  name: string;
  /** The hours the user planned in the period. */
  plannedHours: SprintFigure;
  /** The hours the user actually worked in the period. */
  actualHours: SprintFigure;
  /** How many tasks the user had in the period. */
  taskCount: SprintFigure;
  /** How many days of the period the user submitted. */
  submittedDays: SprintFigure;
  /** How many of those days the user submitted on time. */
  onTimeDays: SprintFigure;
  /**
   * The blocker texts of the user's tasks in the period.
   *
   * A plain list, not a figure: an empty list is a fact ("there were no blockers"), not a
   * missing value.
   */
  blockers: string[];
}

/** A sprint report. */
export interface SprintReportView {
  /** The period the report covers. */
  type: SprintReportType;
  /** The day the report was asked about, 'YYYY-MM-DD'. */
  date: string;
  /** The first day of the period, 'YYYY-MM-DD'. */
  from: string;
  /** The last day of the period, 'YYYY-MM-DD'. */
  to: string;
  /** The team the report covers; null when it covers every team of the PM. */
  teamId: string | null;
  /** One row per user in the PM's scope. */
  rows: SprintReportRow[];
}

// -----------------------------------------------------------------------------
// The PM sheet (P1–P5)
// -----------------------------------------------------------------------------

/** The columns of the team sheet, in the order of the `SheetColumn` enum. */
export const SPRINT_SHEET_COLUMNS = [
  'YESTERDAY',
  'HOURS',
  'TODAY',
  'BLOCKERS',
  'PLAN',
] as const;
export type SprintSheetColumn = (typeof SPRINT_SHEET_COLUMNS)[number];

/** Where a cell's value came from. */
export type SprintCellSource = 'DERIVED' | 'STORED' | 'EMPTY';

/** One sprint week of a team. */
export interface SprintWeekView {
  id: string;
  /** The team the week belongs to. */
  teamId: string;
  /** The name of the team, so the UI does not need a second call for it. */
  teamName: string;
  /** The Monday the week starts on, 'YYYY-MM-DD' in org time. */
  weekStart: string;
  /** The Sunday the week ends on, 'YYYY-MM-DD' in org time. */
  weekEnd: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One cell of the sheet.
 *
 * A cell is either **derived** — the value is worked out from the user's tasks — or
 * **stored**, which means a PM wrote something and that wins (ASSUMPTIONS OQ-1: derive on
 * read, stored edits win).
 */
export interface SprintSheetCellView {
  /** The column this cell is in. */
  column: SprintSheetColumn;
  /** The text in the cell. Empty when there is nothing to show. */
  value: string;
  /** Where the value came from: derived, written by a PM, or nothing at all. */
  source: SprintCellSource;
  /**
   * The version of the stored cell, for the optimistic lock. It is the number the editor
   * sends back as `expectedVersion`; 0 means the cell has no stored row yet.
   */
  version: number;
  /** True when a task on this day is still waiting for its owner. */
  pending: boolean;
  /** The PM who wrote the cell first; null when the cell was never written by a PM. */
  authorPmId: string | null;
  /** The user who wrote the cell first; null when the cell was never written by a user. */
  authorUserId: string | null;
  /** The PM who changed the cell last; null when it was not changed by a PM. */
  updatedByPmId: string | null;
  /** The user who changed the cell last; null when it was not changed by a user. */
  updatedByUserId: string | null;
}

/** One row of the sheet: a user and their cells for one day. */
export interface SprintSheetDayView {
  /** The day this row is for, 'YYYY-MM-DD' in org time. */
  date: string;
  /** True when the day is Friday or Saturday — the weekend. */
  weekend: boolean;
  /** The cells of that day, in the order of the columns. */
  cells: SprintSheetCellView[];
}

/** One row of the sheet: a user and their seven days. */
export interface SprintSheetRowView {
  /** Whose row this is. */
  userId: string;
  /** The name of the user. */
  name: string;
  /** The days of the week, Monday first. */
  days: SprintSheetDayView[];
}

/** The team sheet of one sprint week. */
export interface SprintSheetView {
  /** The week the sheet belongs to. */
  weekId: string;
  /** The team the week belongs to. */
  teamId: string;
  /** The name of the team. */
  teamName: string;
  /** The Monday the week starts on, 'YYYY-MM-DD' in org time. */
  weekStart: string;
  /** The Sunday the week ends on, 'YYYY-MM-DD' in org time. */
  weekEnd: string;
  /** The columns, in order. */
  columns: SprintSheetColumn[];
  /** The rows: one per member of the team. */
  rows: SprintSheetRowView[];
}

/**
 * The answer of a saved cell.
 *
 * `version` is the new version of the cell, so the client can send it back as the
 * `expectedVersion` of its next edit without reading the sheet again.
 */
export interface SprintSavedCellView {
  weekId: string;
  userId: string;
  date: string;
  column: SprintSheetColumn;
  value: string;
  /** The version after this edit. It goes up by one every time. */
  version: number;
}

/** The decision a PM records on behalf of a task owner (P7). */
export const SPRINT_OWNER_DECISIONS = ['VERIFIED', 'NOT_CONFIRMED'] as const;
export type SprintOwnerDecision = (typeof SPRINT_OWNER_DECISIONS)[number];

/**
 * The answer of `POST /pm/sprint/tasks/:id/owner-reply`.
 *
 * The decision is recorded **once**: the write is conditional on the task still being
 * `PENDING`, so two PMs pressing the button at the same moment produce exactly one decision.
 * The loser gets `409 ALREADY_DECIDED`. The answer is the **whole task** after the decision,
 * so the UI can redraw the row without a second call.
 */
export type SprintOwnerReplyView = SprintTaskView;

// -----------------------------------------------------------------------------
// The cross-module payloads
// -----------------------------------------------------------------------------

/**
 * The outbox event types the sprint module emits. The owning module reads them by type.
 *
 * These are the **only** channels the sprint module uses to reach another module's tables
 * (architecture.md section 3.3, rule 5). It never writes `Notification`, `MailDelivery` or
 * `XpEvent` directly.
 */
export const SPRINT_OUTBOX_TYPES = {
  /** -> E09 (growth-core): the on-time sprint XP award. */
  xpOnTimeSprint: 'xp.sprint_on_time',
  /** -> E08 (the mail worker): the task owner's approval mail. */
  approvalMail: 'mail.task_owner_approval',
  /** -> E01 (the notification worker): the sprint notices. */
  notification: 'notification.sprint',
} as const;

export type SprintOutboxType = (typeof SPRINT_OUTBOX_TYPES)[keyof typeof SPRINT_OUTBOX_TYPES];

/** Who a sprint notice is for. */
export type SprintNoticeRecipient =
  | { kind: 'PM'; pmId: string }
  | { kind: 'USER'; userId: string };

/** The notice categories the sprint module uses. Treat them as shared constants. */
export const SPRINT_NOTICE_CATEGORIES = ['Sprint awaiting review', 'Sprint verified'] as const;
export type SprintNoticeCategory = (typeof SPRINT_NOTICE_CATEGORIES)[number];

/** The payload of a `notification.sprint` outbox event. */
export interface SprintNotificationPayload {
  recipient: SprintNoticeRecipient;
  category: SprintNoticeCategory;
  title: string;
  message: string;
  link: string | null;
}

/** The payload of an `xp.sprint_on_time` outbox event. */
export interface SprintXpAwardPayload {
  userId: string;
  /** The org-local day of the submission, 'YYYY-MM-DD'. */
  day: string;
  amount: number;
  submissionId: string;
  source: 'ON_TIME_SPRINT';
  /** `sprint:<userId>:<day>` — unique per workspace, so a retry cannot double-count. */
  key: string;
}

/** The payload of a `mail.task_owner_approval` outbox event. */
export interface SprintApprovalMailPayload {
  sprintTaskId: string;
  recipient: string;
  subject: string;
  body: string;
  purpose: 'TASK_OWNER_APPROVAL';
}

/**
 * The working-day rule the sprint module asks E07 for.
 *
 * The sprint module calls this port in exactly two places (carry-forward and the board), and
 * swaps the implementation when E07's shared calendar service ships.
 */
export interface SprintCalendarPort {
  /** The last working day strictly before `day`, or null when there is none. */
  previousWorkingDay(workspaceId: string, day: string): Promise<string | null>;
  /** True when the day is a working day (not a weekend, not a public holiday). */
  isWorkingDay(workspaceId: string, day: string): Promise<boolean>;
}

/**
 * The XP the sprint module hands to E09.
 *
 * `XpEvent` belongs to E09, so the sprint module does not write it; it calls this port inside
 * the submission's transaction.
 */
export interface SprintXpLedgerPort {
  /** Awards XP for an on-time sprint submission. */
  awardOnTimeSprint(input: {
    workspaceId: string;
    userId: string;
    /** The org-local day of the submission, 'YYYY-MM-DD'. */
    day: string;
    amount: number;
    submissionId: string;
  }): Promise<void>;
}
