import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type {
  MailDeliveryDto,
  PmReportRecord,
  PmReportResponse,
  PrepareReportInput,
  PublishReportInput,
  ReportFileDto,
  ReportPeriodTypeDto,
  ReportVersionDetail,
  SaveReportVersionInput,
  SendReportEmailInput,
  TraineePublishedReportDetail,
  TraineePublishedReportItem,
} from '@bs23/contracts';
import { requirePmActor, requireUserActor, type RequestWithActor } from './reports.actor.js';
import { ReportsService } from './reports.service.js';

/**
 * Thin PM HTTP controller for reports (ADR 0002: no Prisma, no business rules).
 */
@Controller('pm/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  getReport(
    @Req() req: RequestWithActor,
    @Query('userId') userId: string,
    @Query('periodType') periodType: ReportPeriodTypeDto,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
  ): Promise<PmReportResponse> {
    const actor = requirePmActor(req);
    return this.reports.getPmReport(actor, {
      userId,
      periodType,
      periodStart,
      periodEnd,
    });
  }

  @Post('prepare')
  prepareReport(
    @Req() req: RequestWithActor,
    @Body() body: PrepareReportInput,
  ): Promise<PmReportRecord> {
    const actor = requirePmActor(req);
    return this.reports.prepareReport(actor, body);
  }

  @Post(':id/versions')
  saveVersion(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Body() body: SaveReportVersionInput,
  ): Promise<ReportVersionDetail> {
    const actor = requirePmActor(req);
    return this.reports.saveVersion(actor, reportId, body);
  }

  @Get(':id/versions/:versionId')
  getVersion(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Param('versionId') versionId: string,
  ): Promise<ReportVersionDetail> {
    const actor = requirePmActor(req);
    return this.reports.getVersion(actor, reportId, versionId);
  }

  @Post(':id/publish')
  publishReport(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Body() body: PublishReportInput,
  ): Promise<ReportVersionDetail> {
    const actor = requirePmActor(req);
    return this.reports.publishReport(actor, reportId, body ?? {});
  }

  @Post(':id/versions/:versionId/pdf')
  generatePdf(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Param('versionId') versionId: string,
  ): Promise<ReportFileDto> {
    const actor = requirePmActor(req);
    return this.reports.generatePdfRecord(actor, reportId, versionId);
  }

  @Get(':id/emails')
  listEmails(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
  ): Promise<MailDeliveryDto[]> {
    const actor = requirePmActor(req);
    return this.reports.listReportEmails(actor, reportId);
  }

  @Post(':id/emails')
  sendEmail(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Body() body: SendReportEmailInput,
  ): Promise<MailDeliveryDto> {
    const actor = requirePmActor(req);
    return this.reports.emailReport(actor, reportId, body);
  }

  @Post(':id/emails/:deliveryId/retry')
  retryEmail(
    @Req() req: RequestWithActor,
    @Param('id') reportId: string,
    @Param('deliveryId') deliveryId: string,
  ): Promise<MailDeliveryDto> {
    const actor = requirePmActor(req);
    return this.reports.retryReportEmail(actor, reportId, deliveryId);
  }
}

/**
 * Thin User (trainee / resource) HTTP controller for published reports.
 * Drafts are never exposed here (PRD FR-RPT-07, US-85).
 */
@Controller('me/reports')
export class MyReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  listMyReports(@Req() req: RequestWithActor): Promise<TraineePublishedReportItem[]> {
    const actor = requireUserActor(req);
    return this.reports.listMyPublishedReports(actor);
  }

  @Get(':versionId')
  getMyReport(
    @Req() req: RequestWithActor,
    @Param('versionId') versionId: string,
  ): Promise<TraineePublishedReportDetail> {
    const actor = requireUserActor(req);
    return this.reports.getMyPublishedReport(actor, versionId);
  }
}
