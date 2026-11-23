import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  MailDeliveryDto,
  PmReportRecord,
  PmReportResponse,
  PrepareReportInput,
  PublishReportInput,
  ReportFileDto,
  ReportPeriodTypeDto,
  ReportSectionData,
  ReportVersionDetail,
  ReportVersionSummary,
  SaveReportVersionInput,
  SendReportEmailInput,
  TraineePublishedReportDetail,
  TraineePublishedReportItem,
} from '@bs23/contracts';
import { MailService } from './mail.service.js';
import type { PmActor, UserActor } from './reports.actor.js';
import { ReportsAggregator } from './reports.aggregator.js';
import { ReportsRepository } from './reports.repository.js';
import {
  buildReportPdfFilePath,
  evaluateTrainingPeriod,
  nextVersionString,
  parseIsoDate,
  sectionsEqual,
  toIsoDate,
  validateEmailAddress,
  validateNonEmptyString,
  validatePeriodType,
  validateSectionsInput,
} from './reports.validation.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly aggregator: ReportsAggregator,
    private readonly mail: MailService,
  ) {}

  async getPmReport(
    actor: PmActor,
    query: {
      userId: string;
      periodType: ReportPeriodTypeDto;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<PmReportResponse> {
    const userId = validateNonEmptyString(query.userId, 'userId');
    const periodType = validatePeriodType(query.periodType);

    const user = await this.repo.findScopedUser(actor.workspaceId, actor.pmId, userId);
    if (!user) {
      throw new ForbiddenException('This user is not in your scope');
    }

    const onboardIso = toIsoDate(user.onboardDate);
    const departureIso = user.departureDate ? toIsoDate(user.departureDate) : null;
    const todayIso = toIsoDate(new Date());

    const startIso =
      periodType === 'FULL'
        ? onboardIso
        : toIsoDate(parseIsoDate(query.periodStart, 'periodStart'));
    const endIso =
      periodType === 'FULL'
        ? departureIso && departureIso < todayIso
          ? departureIso
          : todayIso
        : toIsoDate(parseIsoDate(query.periodEnd, 'periodEnd'));

    const periodCheck = evaluateTrainingPeriod({
      periodType,
      periodStart: startIso,
      periodEnd: endIso,
      onboardDate: onboardIso,
      departureDate: departureIso,
      today: todayIso,
    });

    const resolvedStartDate = parseIsoDate(periodCheck.resolvedStart, 'periodStart');
    const resolvedEndDate = parseIsoDate(periodCheck.resolvedEnd, 'periodEnd');

    const [existing, evidence] = await Promise.all([
      this.repo.findReportByPeriod({
        workspaceId: actor.workspaceId,
        userId: user.userId,
        periodType,
        periodStart: resolvedStartDate,
        periodEnd: resolvedEndDate,
      }),
      this.aggregator.buildEvidence({
        workspaceId: actor.workspaceId,
        userId: user.userId,
        periodStart: resolvedStartDate,
        periodEnd: resolvedEndDate,
      }),
    ]);

    return {
      report: existing ? this.toReportRecord(existing) : null,
      user: {
        userId: user.userId,
        name: user.name,
        onboardDate: onboardIso,
        departureDate: departureIso,
        archivedAt: user.archivedAt ? user.archivedAt.toISOString() : null,
      },
      period: {
        periodType,
        periodStart: periodCheck.resolvedStart,
        periodEnd: periodCheck.resolvedEnd,
        inTrainingPeriod: periodCheck.inTrainingPeriod,
        outsidePeriodReason: periodCheck.outsidePeriodReason,
      },
      visualSummary: evidence.visualSummary,
      liveSections: evidence.sections,
      versions: existing ? existing.reportVersions.map((v) => this.toVersionSummary(v)) : [],
      mailDeliveries: existing ? existing.mailDeliveries.map((d) => this.mail.toDto(d)) : [],
    };
  }

  async prepareReport(actor: PmActor, input: PrepareReportInput): Promise<PmReportRecord> {
    const userId = validateNonEmptyString(input.userId, 'userId');
    const periodType = validatePeriodType(input.periodType);

    const user = await this.repo.findScopedUser(actor.workspaceId, actor.pmId, userId);
    if (!user) {
      throw new ForbiddenException('This user is not in your scope');
    }

    const onboardIso = toIsoDate(user.onboardDate);
    const departureIso = user.departureDate ? toIsoDate(user.departureDate) : null;
    const todayIso = toIsoDate(new Date());

    const startIso =
      periodType === 'FULL'
        ? onboardIso
        : toIsoDate(parseIsoDate(input.periodStart, 'periodStart'));
    const endIso =
      periodType === 'FULL'
        ? departureIso && departureIso < todayIso
          ? departureIso
          : todayIso
        : toIsoDate(parseIsoDate(input.periodEnd, 'periodEnd'));

    const periodCheck = evaluateTrainingPeriod({
      periodType,
      periodStart: startIso,
      periodEnd: endIso,
      onboardDate: onboardIso,
      departureDate: departureIso,
      today: todayIso,
    });

    if (!periodCheck.inTrainingPeriod) {
      throw new BadRequestException(
        `Outside the training period (${onboardIso} – ${departureIso ?? 'ongoing'}).`,
      );
    }

    const resolvedStartDate = parseIsoDate(periodCheck.resolvedStart, 'periodStart');
    const resolvedEndDate = parseIsoDate(periodCheck.resolvedEnd, 'periodEnd');

    const existing = await this.repo.findReportByPeriod({
      workspaceId: actor.workspaceId,
      userId: user.userId,
      periodType,
      periodStart: resolvedStartDate,
      periodEnd: resolvedEndDate,
    });
    if (existing) {
      return this.toReportRecord(existing);
    }

    const evidence = await this.aggregator.buildEvidence({
      workspaceId: actor.workspaceId,
      userId: user.userId,
      periodStart: resolvedStartDate,
      periodEnd: resolvedEndDate,
    });

    const created = await this.repo.createReport({
      workspaceId: actor.workspaceId,
      userId: user.userId,
      periodType,
      periodStart: resolvedStartDate,
      periodEnd: resolvedEndDate,
      sections: evidence.sections,
    });

    return this.toReportRecord(created);
  }

  /**
   * PRD FR-RPT-04 / US-82:
   * Every save creates a new draft ReportVersion (v1.0, v2.0, ...) and updates
   * the editable report copy only. Never touches source tables.
   */
  async saveVersion(
    actor: PmActor,
    reportId: string,
    input: SaveReportVersionInput,
  ): Promise<ReportVersionDetail> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const sections = validateSectionsInput(input.sections);
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
    const version = nextVersionString(report.reportVersions.map((v) => v.version));

    const created = await this.repo.createVersionAndUpdateReport({
      workspaceId: actor.workspaceId,
      reportId: report.id,
      version,
      sections,
      note,
      savedById: actor.pmId,
      publishNow: false,
    });

    return this.toVersionDetail(created);
  }

  async getVersion(
    actor: PmActor,
    reportId: string,
    versionId: string,
  ): Promise<ReportVersionDetail> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const version = await this.repo.findVersionForReport(actor.workspaceId, report.id, versionId);
    if (!version) {
      throw new NotFoundException('Report version not found.');
    }

    return this.toVersionDetail(version);
  }

  /**
   * PRD FR-RPT-06 / US-84:
   * Publish marks the latest saved version published, OR saves the current copy
   * as a new version first if it changed (or if no version has been saved yet).
   * Publishing unchanged content does NOT create a duplicate version.
   */
  async publishReport(
    actor: PmActor,
    reportId: string,
    input: PublishReportInput = {},
  ): Promise<ReportVersionDetail> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const incomingSections =
      input.sections !== undefined
        ? validateSectionsInput(input.sections)
        : (report.sections as unknown as ReportSectionData[]);
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;

    const latestVersion = report.reportVersions[0] ?? null;

    if (
      !latestVersion ||
      !sectionsEqual(incomingSections, latestVersion.sections as unknown as ReportSectionData[])
    ) {
      const version = nextVersionString(report.reportVersions.map((v) => v.version));
      const created = await this.repo.createVersionAndUpdateReport({
        workspaceId: actor.workspaceId,
        reportId: report.id,
        version,
        sections: incomingSections,
        note,
        savedById: actor.pmId,
        publishNow: true,
      });
      return this.toVersionDetail(created);
    }

    if (latestVersion.publishedAt !== null) {
      return this.toVersionDetail(latestVersion);
    }

    const published = await this.repo.markVersionPublished(latestVersion.id, actor.pmId);
    return this.toVersionDetail(published);
  }

  async generatePdfRecord(
    actor: PmActor,
    reportId: string,
    versionId: string,
  ): Promise<ReportFileDto> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const version = await this.repo.findVersionForReport(actor.workspaceId, report.id, versionId);
    if (!version) {
      throw new NotFoundException('Report version not found.');
    }

    const filePath = buildReportPdfFilePath(
      report.userId,
      report.periodType as ReportPeriodTypeDto,
      toIsoDate(report.periodStart),
      toIsoDate(report.periodEnd),
    );

    const record = await this.repo.createReportFile({
      workspaceId: actor.workspaceId,
      versionId: version.id,
      filePath,
      generatedById: actor.pmId,
    });

    return {
      id: record.id,
      versionId: record.versionId,
      filePath: record.filePath,
      generatedById: record.generatedById,
      generatedAt: record.generatedAt.toISOString(),
    };
  }

  async emailReport(
    actor: PmActor,
    reportId: string,
    input: SendReportEmailInput,
  ): Promise<MailDeliveryDto> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const recipient = validateEmailAddress(input.recipient);
    const subject = validateNonEmptyString(input.subject, 'subject');
    const message = validateNonEmptyString(input.message, 'message');

    let reportVersionId: string | undefined;
    if (input.reportVersionId) {
      const version = await this.repo.findVersionForReport(
        actor.workspaceId,
        report.id,
        input.reportVersionId,
      );
      if (!version) {
        throw new NotFoundException('Report version not found.');
      }
      reportVersionId = version.id;
    } else if (report.reportVersions[0]) {
      reportVersionId = report.reportVersions[0].id;
    }

    return this.mail.send({
      workspaceId: actor.workspaceId,
      purpose: 'REPORT',
      recipient,
      subject,
      body: message,
      reportId: report.id,
      reportVersionId,
    });
  }

  async listReportEmails(actor: PmActor, reportId: string): Promise<MailDeliveryDto[]> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const deliveries = await this.repo.listMailDeliveriesForReport(actor.workspaceId, report.id);
    return deliveries.map((d) => this.mail.toDto(d));
  }

  async retryReportEmail(
    actor: PmActor,
    reportId: string,
    deliveryId: string,
  ): Promise<MailDeliveryDto> {
    const report = await this.repo.findScopedReportById(actor.workspaceId, actor.pmId, reportId);
    if (!report) {
      throw new NotFoundException('Report not found in your scope.');
    }

    const existing = await this.repo.findMailDeliveryForReport(
      actor.workspaceId,
      report.id,
      deliveryId,
    );
    if (!existing) {
      throw new NotFoundException('Mail delivery not found.');
    }
    if (existing.status === 'ACCEPTED') {
      throw new BadRequestException('Accepted email deliveries cannot be retried.');
    }

    const retried = await this.mail.retryDelivery(actor.workspaceId, existing.id);
    if (!retried) {
      throw new NotFoundException('Mail delivery not found.');
    }
    return retried;
  }

  /**
   * PRD FR-RPT-07 / US-85:
   * Users see ONLY published versions (publishedAt != null), sorted newest first.
   */
  async listMyPublishedReports(actor: UserActor): Promise<TraineePublishedReportItem[]> {
    const rows = await this.repo.listPublishedVersionsForUser(actor.workspaceId, actor.userId);
    return rows.map((row) => ({
      versionId: row.id,
      reportId: row.report.id,
      version: row.version,
      periodType: row.report.periodType as ReportPeriodTypeDto,
      periodStart: toIsoDate(row.report.periodStart),
      periodEnd: toIsoDate(row.report.periodEnd),
      publishedById: row.publishedById ?? row.savedById,
      publishedByName: row.publishedBy?.name ?? row.publishedById ?? '',
      publishedAt: row.publishedAt!.toISOString(),
    }));
  }

  async getMyPublishedReport(
    actor: UserActor,
    versionId: string,
  ): Promise<TraineePublishedReportDetail> {
    const row = await this.repo.findPublishedVersionForUser(
      actor.workspaceId,
      actor.userId,
      versionId,
    );
    if (!row || !row.publishedAt) {
      throw new NotFoundException('Published report not found.');
    }

    const evidence = await this.aggregator.buildEvidence({
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      periodStart: row.report.periodStart,
      periodEnd: row.report.periodEnd,
    });

    return {
      versionId: row.id,
      reportId: row.report.id,
      version: row.version,
      periodType: row.report.periodType as ReportPeriodTypeDto,
      periodStart: toIsoDate(row.report.periodStart),
      periodEnd: toIsoDate(row.report.periodEnd),
      publishedById: row.publishedById ?? row.savedById,
      publishedByName: row.publishedBy?.name ?? row.publishedById ?? '',
      publishedAt: row.publishedAt.toISOString(),
      sections: row.sections as unknown as ReportSectionData[],
      visualSummary: evidence.visualSummary,
    };
  }

  private toReportRecord(report: {
    id: string;
    userId: string;
    periodType: string;
    periodStart: Date;
    periodEnd: Date;
    sections: unknown;
    updatedAt: Date;
  }): PmReportRecord {
    return {
      id: report.id,
      userId: report.userId,
      periodType: report.periodType as ReportPeriodTypeDto,
      periodStart: toIsoDate(report.periodStart),
      periodEnd: toIsoDate(report.periodEnd),
      sections: report.sections as ReportSectionData[],
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private toVersionSummary(v: {
    id: string;
    version: string;
    note: string | null;
    savedById: string;
    savedBy: { name: string };
    savedAt: Date;
    publishedById: string | null;
    publishedBy: { name: string } | null;
    publishedAt: Date | null;
  }): ReportVersionSummary {
    return {
      id: v.id,
      version: v.version,
      note: v.note,
      savedById: v.savedById,
      savedByName: v.savedBy.name,
      savedAt: v.savedAt.toISOString(),
      publishedById: v.publishedById,
      publishedByName: v.publishedBy?.name ?? null,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    };
  }

  private toVersionDetail(v: {
    id: string;
    version: string;
    note: string | null;
    sections: unknown;
    savedById: string;
    savedBy: { name: string };
    savedAt: Date;
    publishedById: string | null;
    publishedBy: { name: string } | null;
    publishedAt: Date | null;
  }): ReportVersionDetail {
    return {
      ...this.toVersionSummary(v),
      sections: v.sections as ReportSectionData[],
    };
  }
}
