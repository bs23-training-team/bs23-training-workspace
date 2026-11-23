import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { REPORT_SECTION_NAMES, type ReportSectionData } from '@bs23/contracts';
import { MailService } from './mail.service.js';
import type { PmActor, UserActor } from './reports.actor.js';
import { ReportsAggregator } from './reports.aggregator.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

function makeSections(pmNote = ''): ReportSectionData[] {
  return REPORT_SECTION_NAMES.map((name) => ({
    name,
    lines: [{ label: 'Summary', value: 'Data unavailable for this period', source: 'unavailable' }],
    pmNote,
  }));
}

describe('ReportsService', () => {
  const pmActor: PmActor = { role: 'PM', pmId: 'PM001', workspaceId: 'ws-1' };
  const userActor: UserActor = { role: 'USER', userId: 'BS23001', workspaceId: 'ws-1' };

  const repo = {
    findScopedUser: vi.fn(),
    findReportByPeriod: vi.fn(),
    findScopedReportById: vi.fn(),
    createReport: vi.fn(),
    createVersionAndUpdateReport: vi.fn(),
    markVersionPublished: vi.fn(),
    findVersionForReport: vi.fn(),
    createReportFile: vi.fn(),
    listMailDeliveriesForReport: vi.fn(),
    findMailDeliveryForReport: vi.fn(),
    listPublishedVersionsForUser: vi.fn(),
    findPublishedVersionForUser: vi.fn(),
  };

  const aggregator = {
    buildEvidence: vi.fn(),
  };

  const mail = {
    send: vi.fn(),
    retryDelivery: vi.fn(),
    toDto: vi.fn((d: unknown) => d),
  };

  let service: ReportsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: repo },
        { provide: ReportsAggregator, useValue: aggregator },
        { provide: MailService, useValue: mail },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  it('rejects PM access to a user outside their scope (FR-ROLE-02)', async () => {
    repo.findScopedUser.mockResolvedValue(null);
    await expect(
      service.getPmReport(pmActor, {
        userId: 'BS23999',
        periodType: 'WEEKLY',
        periodStart: '2026-11-02',
        periodEnd: '2026-11-08',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates a new draft version v2.0 on save without publishing (US-82)', async () => {
    const sections = makeSections('Good progress');
    repo.findScopedReportById.mockResolvedValue({
      id: 'rep-1',
      userId: 'BS23001',
      periodType: 'WEEKLY',
      periodStart: new Date('2026-11-02'),
      periodEnd: new Date('2026-11-08'),
      sections: makeSections(),
      reportVersions: [{ id: 'v1', version: '1.0', sections: makeSections(), publishedAt: null }],
    });
    repo.createVersionAndUpdateReport.mockResolvedValue({
      id: 'v2',
      version: '2.0',
      note: 'Updated notes',
      sections,
      savedById: 'PM001',
      savedBy: { name: 'Sarah' },
      savedAt: new Date('2026-11-20T10:00:00Z'),
      publishedById: null,
      publishedBy: null,
      publishedAt: null,
    });

    const result = await service.saveVersion(pmActor, 'rep-1', {
      sections,
      note: 'Updated notes',
    });

    expect(result.version).toBe('2.0');
    expect(result.publishedAt).toBeNull();
    expect(repo.createVersionAndUpdateReport).toHaveBeenCalledWith(
      expect.objectContaining({ version: '2.0', publishNow: false }),
    );
  });

  it('publishes latest saved version without creating a duplicate when content is unchanged (US-84)', async () => {
    const sections = makeSections('Final note');
    repo.findScopedReportById.mockResolvedValue({
      id: 'rep-1',
      userId: 'BS23001',
      periodType: 'WEEKLY',
      periodStart: new Date('2026-11-02'),
      periodEnd: new Date('2026-11-08'),
      sections,
      reportVersions: [{ id: 'v1', version: '1.0', sections, publishedAt: null }],
    });
    repo.markVersionPublished.mockResolvedValue({
      id: 'v1',
      version: '1.0',
      note: null,
      sections,
      savedById: 'PM001',
      savedBy: { name: 'Sarah' },
      savedAt: new Date('2026-11-20T09:00:00Z'),
      publishedById: 'PM001',
      publishedBy: { name: 'Sarah' },
      publishedAt: new Date('2026-11-20T10:00:00Z'),
    });

    const result = await service.publishReport(pmActor, 'rep-1', { sections });

    expect(repo.createVersionAndUpdateReport).not.toHaveBeenCalled();
    expect(repo.markVersionPublished).toHaveBeenCalledWith('v1', 'PM001');
    expect(result.version).toBe('1.0');
    expect(result.publishedAt).not.toBeNull();
  });

  it('creates and publishes a new version when content changed before publish (FR-RPT-06)', async () => {
    const oldSections = makeSections('Draft 1');
    const newSections = makeSections('Edited before publish');
    repo.findScopedReportById.mockResolvedValue({
      id: 'rep-1',
      userId: 'BS23001',
      periodType: 'WEEKLY',
      periodStart: new Date('2026-11-02'),
      periodEnd: new Date('2026-11-08'),
      sections: oldSections,
      reportVersions: [{ id: 'v1', version: '1.0', sections: oldSections, publishedAt: null }],
    });
    repo.createVersionAndUpdateReport.mockResolvedValue({
      id: 'v2',
      version: '2.0',
      note: null,
      sections: newSections,
      savedById: 'PM001',
      savedBy: { name: 'Sarah' },
      savedAt: new Date('2026-11-20T10:00:00Z'),
      publishedById: 'PM001',
      publishedBy: { name: 'Sarah' },
      publishedAt: new Date('2026-11-20T10:00:00Z'),
    });

    const result = await service.publishReport(pmActor, 'rep-1', { sections: newSections });

    expect(repo.createVersionAndUpdateReport).toHaveBeenCalledWith(
      expect.objectContaining({ version: '2.0', publishNow: true }),
    );
    expect(result.version).toBe('2.0');
    expect(result.publishedAt).not.toBeNull();
  });

  it('refuses retrying an already ACCEPTED email delivery (US-83)', async () => {
    repo.findScopedReportById.mockResolvedValue({ id: 'rep-1', reportVersions: [] });
    repo.findMailDeliveryForReport.mockResolvedValue({ id: 'mail-1', status: 'ACCEPTED' });

    await expect(service.retryReportEmail(pmActor, 'rep-1', 'mail-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('returns NotFound when trainee requests a draft or missing version (US-85)', async () => {
    repo.findPublishedVersionForUser.mockResolvedValue(null);
    await expect(service.getMyPublishedReport(userActor, 'draft-v1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('generates PDF metadata with the PRD filename format (FR-RPT-05)', async () => {
    repo.findScopedReportById.mockResolvedValue({
      id: 'rep-1',
      userId: 'BS23001',
      periodType: 'MONTHLY',
      periodStart: new Date('2026-11-01'),
      periodEnd: new Date('2026-11-30'),
      reportVersions: [],
    });
    repo.findVersionForReport.mockResolvedValue({ id: 'v1' });
    repo.createReportFile.mockResolvedValue({
      id: 'file-1',
      versionId: 'v1',
      filePath: 'reports/BS23001_monthly_2026-11-01_2026-11-30.pdf',
      generatedById: 'PM001',
      generatedAt: new Date('2026-11-20T10:00:00Z'),
    });

    const file = await service.generatePdfRecord(pmActor, 'rep-1', 'v1');
    expect(file.filePath).toBe('reports/BS23001_monthly_2026-11-01_2026-11-30.pdf');
  });
});
