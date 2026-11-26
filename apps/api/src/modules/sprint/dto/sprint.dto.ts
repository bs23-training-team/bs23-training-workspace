import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SPRINT_TASK_CATEGORIES } from '@bs23/contracts';
import { IsDay, trim } from './base.dto.js';

/**
 * The request bodies of the sprint module.
 *
 * Every rule here is a business rule of the PRD, not a shape convention:
 * - a task's hours are >= 0 (the database checks it too),
 * - a category and an owner go together: a task for oneself has neither, a task for an RND
 *   team or an SBU has both (DS-01.3, E-10),
 * - `workspaceId` and `userId` are never accepted from the client: the caller is the signed-in
 *   person, and every query is filtered by their workspace (SRS 5.2, PRD EP-14).
 *
 * The validation classes stay here — a class-validator DTO cannot live in a shared type
 * package — but the **vocabularies** they check against come from `@bs23/contracts`, so the
 * API and the web client can never disagree about what a category or a column is.
 */

/** The kind of owner a task can be sent to. The same words as the `TaskCategory` enum. */
export const TASK_CATEGORIES = SPRINT_TASK_CATEGORIES;
export type TaskCategoryValue = (typeof TASK_CATEGORIES)[number];

/** `POST /sprint/tasks` — create a task (U3, SRS 5.3). */
export class CreateTaskDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description: string;

  /** The day the task belongs to, 'YYYY-MM-DD' in org time. */
  @IsDay()
  date: string;

  /** Hours planned. The database checks `>= 0`. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  plannedHours: number;

  /** Hours actually spent. The database checks `>= 0`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  actualHours?: number;

  /** What is blocking the task. Empty means nothing is blocking it. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  blocker?: string;

  /**
   * 'RND' or 'SBU'. Empty for a task done for oneself — and then there is no owner either
   * (the rule "category and owner go together" is checked here and by the database).
   */
  @IsOptional()
  @IsIn(TASK_CATEGORIES)
  category?: TaskCategoryValue;

  /** The `TaskOwner` who has to verify the task. Only allowed together with a category. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  ownerId?: string;
}

/** `PATCH /sprint/tasks/:id` — update a task (U4, SRS 5.3). */
export class UpdateTaskDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  plannedHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  actualHours?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  blocker?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

/** `POST /sprint/carry-forward` — carry the previous working day's open tasks (U6). */
export class CarryForwardDto {
  /** The day to carry the tasks to, 'YYYY-MM-DD' in org time. */
  @IsDay()
  date: string;
}

/** `GET /sprint/history` — the history list (U9, SRS 5.3). */
export class HistoryQueryDto {
  /** Where to start. A day, 'YYYY-MM-DD'. */
  @IsOptional()
  @IsDay()
  cursor?: string;

  /** How many rows. Default 20, maximum 100 (SRS 5.2). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** `GET /sprint/board` — the board of one day (U2, SRS 5.3). */
export class BoardQueryDto {
  /** The day to show. Defaults to today in org time. */
  @IsOptional()
  @IsDay()
  date?: string;
}

/** `GET /sprint/task-owners` — the owners to pick (U1, SRS 5.3). */
export class TaskOwnerQueryDto {
  /** 'RND' or 'SBU'. */
  @IsIn(TASK_CATEGORIES)
  kind: TaskCategoryValue;
}
