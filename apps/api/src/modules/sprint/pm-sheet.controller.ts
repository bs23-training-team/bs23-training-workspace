import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../identity/decorators/access.decorators.js';
import { sprintValidation } from './dto/base.dto.js';
import {
  CreateSprintWeekDto,
  SaveCellDto,
  SprintWeeksQueryDto,
} from './dto/pm-sprint.dto.js';
import { CurrentActor, SprintHttp } from './http/actor.guard.js';
import { PmSheetService } from './pm-sheet.service.js';
import { buildSheetWorkbook } from './pm-sheet.xlsx.js';
import type { SprintActor } from './http/actor.js';
import type {
  SavedCellView,
  SprintSheetView,
  SprintWeekView,
} from './dto/pm-sheet-response.dto.js';

/**
 * The PM's team sheet API (SRS 5.4, FR-DS-06).
 *
 * Every route runs `SprintHttp()`, which is E01's `JwtAuthGuard` (it checks the token and
 * sets `req.user`), then the sprint actor guard (it turns `req.user` into the caller, 401
 * when there is nobody), then E01's `RolesGuard` (403 for the wrong role).
 *
 * The controller is thin: it validates the input, takes the caller off the request, and
 * calls the service. It never reads a header, and it never takes a `pmId` from the client —
 * the PM is whoever signed in (PRD EP-14).
 *
 * The PM's own scope is decided in the service, against the rows: a PM may only work on the
 * teams they manage (PRD BR-08).
 */
@Controller('pm/sprint')
@SprintHttp()
@Roles('PM')
export class PmSheetController {
  constructor(private readonly sheet: PmSheetService) {}

  /**
   * P1 — the sprint weeks of a team.
   *
   * A team of another PM answers 403 `FORBIDDEN_SCOPE`.
   */
  @Get('weeks')
  listWeeks(
    @CurrentActor() actor: SprintActor,
    @Query(sprintValidation(SprintWeeksQueryDto)) query: SprintWeeksQueryDto,
  ): Promise<SprintWeekView[]> {
    return this.sheet.listWeeks(actor, query.teamId);
  }

  /**
   * P2 — add a sprint week to a team.
   *
   * A week that does not start on a Monday answers 422 `WEEK_START_NOT_MONDAY`; a second
   * week for the same team and Monday answers 409 `WEEK_EXISTS`.
   */
  @Post('weeks')
  @HttpCode(201)
  addSprintWeek(
    @CurrentActor() actor: SprintActor,
    @Body(sprintValidation(CreateSprintWeekDto)) body: CreateSprintWeekDto,
  ): Promise<SprintWeekView> {
    return this.sheet.addSprintWeek(actor, body.teamId, body.weekStart);
  }

  /**
   * P3 — the team sheet of a sprint week.
   *
   * The grid is derived on read, and a stored edit wins over the derived value.
   */
  @Get('weeks/:id/sheet')
  getSheet(
    @CurrentActor() actor: SprintActor,
    @Param('id') id: string,
  ): Promise<SprintSheetView> {
    return this.sheet.getSheet(actor, id);
  }

  /**
   * P4 — save one cell of the team sheet.
   *
   * The edit is refused with 409 `CELL_CONFLICT` when the cell was changed by somebody
   * else since the editor last saw it.
   */
  @Put('cells')
  @HttpCode(200)
  saveCell(
    @CurrentActor() actor: SprintActor,
    @Body(sprintValidation(SaveCellDto)) body: SaveCellDto,
  ): Promise<SavedCellView> {
    return this.sheet.saveCell(actor, {
      weekId: body.weekId,
      userId: body.userId,
      date: body.date,
      column: body.column,
      value: body.value,
      expectedVersion: body.expectedVersion,
    });
  }

  /**
   * P5 — the sheet as an XLSX file.
   *
   * The file is built on the backend (ASSUMPTIONS OQ-11). The response is a file download,
   * not the JSON envelope: the other routes answer JSON, this one answers a workbook.
   */
  @Get('weeks/:id/export')
  async exportSheet(
    @CurrentActor() actor: SprintActor,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const sheet = await this.sheet.getSheetForExport(actor, id);
    const buffer = await buildSheetWorkbook(sheet);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="sprint-week-${sheet.weekStart}.xlsx"`,
    );
    response.setHeader('Content-Length', String(buffer.length));
    response.end(buffer);
  }
}
