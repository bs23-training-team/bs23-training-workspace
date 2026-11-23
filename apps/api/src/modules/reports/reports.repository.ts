import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ReportPeriodTypeDto, ReportSectionData } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findScopedUser(workspaceId: string, pmId: string, userId: string) {
    return this.prisma.user.findFirst({
      where: { workspaceId, pmId, userId },
      select: {
        userId: true,
        name: true,
        onboardDate: true,
        departureDate: true,
        archivedAt: true,
      },
    });
  }

  findReportByPeriod(params: {
    workspaceId: string;
    userId: string;
    periodType: ReportPeriodTypeDto;
    periodStart: Date;
    periodEnd: Date;
  }) {
    return this.prisma.report.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      },
      include: {
        reportVersions: {
          orderBy: { savedAt: 'desc' },
          include: {
            savedBy: { select: { name: true } },
            publishedBy: { select: { name: true } },
          },
        },
        mailDeliveries: {
          orderBy: { createdAt: 'desc' },
          include: {
            mailAttempts: { orderBy: { attemptNo: 'asc' } },
          },
        },
      },
    });
  }

  findScopedReportById(workspaceId: string, pmId: string, reportId: string) {
    return this.prisma.report.findFirst({
      where: {
        id: reportId,
        workspaceId,
        user: { pmId },
      },
      include: {
        user: {
          select: {
            userId: true,
            name: true,
            onboardDate: true,
            departureDate: true,
            archivedAt: true,
          },
        },
        reportVersions: {
          orderBy: { savedAt: 'desc' },
          include: {
            savedBy: { select: { name: true } },
            publishedBy: { select: { name: true } },
          },
        },
        mailDeliveries: {
          orderBy: { createdAt: 'desc' },
          include: {
            mailAttempts: { orderBy: { attemptNo: 'asc' } },
          },
        },
      },
    });
  }

  createReport(params: {
    workspaceId: string;
    userId: string;
    periodType: ReportPeriodTypeDto;
    periodStart: Date;
    periodEnd: Date;
    sections: ReportSectionData[];
  }) {
    return this.prisma.report.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        sections: params.sections as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async createVersionAndUpdateReport(params: {
    workspaceId: string;
    reportId: string;
    version: string;
    sections: ReportSectionData[];
    note: string | null;
    savedById: string;
    publishNow?: boolean;
  }) {
    const now = new Date();
    const sectionsJson = params.sections as unknown as Prisma.InputJsonValue;

    const [, createdVersion] = await this.prisma.$transaction([
      this.prisma.report.update({
        where: { id: params.reportId },
        data: { sections: sectionsJson },
      }),
      this.prisma.reportVersion.create({
        data: {
          workspaceId: params.workspaceId,
          reportId: params.reportId,
          version: params.version,
          sections: sectionsJson,
          note: params.note,
          savedById: params.savedById,
          savedAt: now,
          publishedById: params.publishNow ? params.savedById : null,
          publishedAt: params.publishNow ? now : null,
        },
        include: {
          savedBy: { select: { name: true } },
          publishedBy: { select: { name: true } },
        },
      }),
    ]);

    return createdVersion;
  }

  markVersionPublished(versionId: string, publishedById: string) {
    return this.prisma.reportVersion.update({
      where: { id: versionId },
      data: {
        publishedById,
        publishedAt: new Date(),
      },
      include: {
        savedBy: { select: { name: true } },
        publishedBy: { select: { name: true } },
      },
    });
  }

  findVersionForReport(workspaceId: string, reportId: string, versionId: string) {
    return this.prisma.reportVersion.findFirst({
      where: { id: versionId, reportId, workspaceId },
      include: {
        savedBy: { select: { name: true } },
        publishedBy: { select: { name: true } },
      },
    });
  }

  createReportFile(params: {
    workspaceId: string;
    versionId: string;
    filePath: string;
    generatedById: string;
  }) {
    return this.prisma.reportFile.create({
      data: {
        workspaceId: params.workspaceId,
        versionId: params.versionId,
        filePath: params.filePath,
        generatedById: params.generatedById,
      },
    });
  }

  listMailDeliveriesForReport(workspaceId: string, reportId: string) {
    return this.prisma.mailDelivery.findMany({
      where: { workspaceId, reportId, purpose: 'REPORT' },
      orderBy: { createdAt: 'desc' },
      include: {
        mailAttempts: { orderBy: { attemptNo: 'asc' } },
      },
    });
  }

  findMailDeliveryForReport(workspaceId: string, reportId: string, deliveryId: string) {
    return this.prisma.mailDelivery.findFirst({
      where: { id: deliveryId, workspaceId, reportId, purpose: 'REPORT' },
    });
  }

  listPublishedVersionsForUser(workspaceId: string, userId: string) {
    return this.prisma.reportVersion.findMany({
      where: {
        workspaceId,
        publishedAt: { not: null },
        report: { userId },
      },
      orderBy: { publishedAt: 'desc' },
      include: {
        report: {
          select: {
            id: true,
            periodType: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        publishedBy: { select: { name: true } },
      },
    });
  }

  findPublishedVersionForUser(workspaceId: string, userId: string, versionId: string) {
    return this.prisma.reportVersion.findFirst({
      where: {
        id: versionId,
        workspaceId,
        publishedAt: { not: null },
        report: { userId },
      },
      include: {
        report: {
          select: {
            id: true,
            userId: true,
            periodType: true,
            periodStart: true,
            periodEnd: true,
          },
        },
        publishedBy: { select: { name: true } },
      },
    });
  }
}
