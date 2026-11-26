import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SPRINT_OWNER_DECISIONS,
  SPRINT_REPORT_TYPES,
  SPRINT_SHEET_COLUMNS,
  type SprintReportType,
} from '@bs23/contracts';
import { IsDay, trim } from './base.dto.js';

/**
 * The request bodies of the PM side of the sprint module.
 *
 * The PM's own scope is never accepted from the client: it comes from the signed-in PM
 * (`req.user.sub`). Only the ids of rows inside that scope are accepted, and they are checked
 * against the scope before anything is read or written (PRD BR-08, SRS DS-02.5).
 *
 * The validation classes stay here — a class-validator DTO cannot live in a shared type
 * package — but the **vocabularies** they check against come from `@bs23/contracts`, so the
 * API and the web client can never disagree about what a column, a decision or a report type
 * is.
 */

/** The columns of the team sheet. The order is the order of the `SheetColumn` enum. */
export const SHEET_COLUMNS = SPRINT_SHEET_COLUMNS;
export type SheetColumnValue = (typeof SHEET_COLUMNS)[number];

/** The decision a PM records on behalf of a task owner (P7, SRS DS-02.4). */
export const OWNER_DECISIONS = SPRINT_OWNER_DECISIONS;
export type OwnerDecisionValue = (typeof OWNER_DECISIONS)[number];

/** `GET /pm/sprint/weeks` — the weeks of a team (P1). */
export class SprintWeeksQueryDto {
  /** The team whose weeks to list. */
  @IsString()
  @MaxLength(64)
  teamId: string;
}

/** `POST /pm/sprint/weeks` — add a sprint week (P2, SRS DS-06.2). */
export class CreateSprintWeekDto {
  /** The team the week belongs to. */
  @IsString()
  @MaxLength(64)
  teamId: string;

  /**
   * The Monday the week starts on, 'YYYY-MM-DD'.
   *
   * A day that is not a Monday is refused with 422 `WEEK_START_NOT_MONDAY`; the database
   * refuses it too (CHECK `chk_sprintweek_monday`).
   */
  @IsDay()
  weekStart: string;
}

/** `PUT /pm/sprint/cells` — save one cell of the team sheet (P4, SRS DS-06.8). */
export class SaveCellDto {
  /** The sprint week the cell belongs to. */
  @IsString()
  @MaxLength(64)
  weekId: string;

  /** Whose row the cell is in. */
  @IsString()
  @MaxLength(64)
  userId: string;

  /** The day the cell belongs to, 'YYYY-MM-DD'. */
  @IsDay()
  date: string;

  /** The column. */
  @IsIn(SHEET_COLUMNS)
  column: SheetColumnValue;

  /** The text in the cell. */
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  value: string;

  /**
   * The version the editor saw. 0 means the cell has no stored row yet, so this is the first
   * edit (DS-06.8, E-18). A mismatch is 409 `CELL_CONFLICT`.
   */
  @IsInt()
  @Min(0)
  expectedVersion: number;
}

/** `POST /pm/sprint/tasks/:id/owner-reply` — record the owner's answer (P7, SRS DS-02.4). */
export class OwnerReplyDto {
  /** 'VERIFIED' or 'NOT_CONFIRMED'. */
  @IsIn(OWNER_DECISIONS)
  decision: OwnerDecisionValue;
}

/** `GET /pm/sprint/reports` — the sprint report (P6, SRS 5.4). */
export class SprintReportQueryDto {
  /** Which report to build. */
  @IsIn(SPRINT_REPORT_TYPES)
  type: SprintReportType;

  /** The day the report is about, 'YYYY-MM-DD'. */
  @IsDay()
  date: string;

  /** The team to report on. Optional: without it the report covers every team of the PM. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  teamId?: string;
}
