import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../identity/decorators/access.decorators.js';
import { sprintValidation } from './dto/base.dto.js';
import { SprintReportQueryDto } from './dto/pm-sprint.dto.js';
import { CurrentActor, SprintHttp } from './http/actor.guard.js';
import { PmReportsService } from './pm-reports.service.js';
import type { SprintActor } from './http/actor.js';
import type { SprintReportView } from './dto/sprint-response.dto.js';

/**
 * The PM's sprint report API (SRS 5.4, FR-DS-07).
 *
 * The route runs `SprintHttp()`: E01's `JwtAuthGuard` (checks the token, sets `req.user`),
 * then the sprint actor guard (turns `req.user` into the caller, 401 when there is nobody),
 * then E01's `RolesGuard` (403 for a user).
 *
 * The controller is thin: it validates the query, takes the caller off the request and calls
 * the service. It never reads a header and never takes a `pmId` from the client — the PM is
 * whoever signed in (PRD EP-14).
 */
@Controller('pm/sprint')
@SprintHttp()
@Roles('PM')
export class PmReportsController {
  constructor(private readonly reports: PmReportsService) {}

  /**
   * P6 — the sprint report.
   *
   * The period is one of `daily`, `weekly`, `biweekly` or `monthly`; the day is the day the
   * report is about. Every figure says where it came from, and a missing value is shown as
   * missing (PRD NFR-09).
   *
   * A team of another PM answers 403 `FORBIDDEN_SCOPE`.
   */
  @Get('reports')
  getReports(
    @CurrentActor() actor: SprintActor,
    @Query(sprintValidation(SprintReportQueryDto)) query: SprintReportQueryDto,
  ): Promise<SprintReportView> {
    return this.reports.getReports(actor, query);
  }
}
