/**
 * API client for E08 (Reports) feature.
 * Communicates with the NestJS API (default: http://localhost:4000).
 * Standard auth: uses session / cookie (credentials: 'include').
 * Security: does NOT send spoofable x-actor-* or x-workspace-id headers.
 * Uses mock data fallbacks until login exists (per code review instructions).
 */

import {
  MOCK_PM_REPORT,
  MOCK_TRAINEE_REPORT_DETAIL,
  MOCK_TRAINEE_REPORTS,
} from './fixtures';
import type {
  MailDeliveryDto,
  PmReportResponse,
  ReportFileDto,
  ReportPeriodType,
  ReportSectionData,
  ReportVersionDetail,
  SendEmailPayload,
  TraineePublishedReportDetail,
  TraineePublishedReportItem,
} from './types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (customHeaders) {
    Object.assign(headers, customHeaders);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson.message === 'string') {
        errorMessage = errJson.message;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errorMessage);
  }

  return res.json() as Promise<T>;
}

export async function getPmReport(params: {
  userId: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
}): Promise<PmReportResponse> {
  const query = new URLSearchParams({
    userId: params.userId,
    periodType: params.periodType,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  try {
    return await request<PmReportResponse>(`/pm/reports?${query.toString()}`, {
      method: 'GET',
    });
  } catch (err) {
    // Until login exists, fall back to mock data
    console.warn('Backend returned error or requires auth; using mock data:', err);
    return {
      ...MOCK_PM_REPORT,
      user: {
        ...MOCK_PM_REPORT.user,
        userId: params.userId,
      },
      period: {
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        inTrainingPeriod: true,
        outsidePeriodReason: null,
      },
    };
  }
}

export async function prepareReport(params: {
  userId: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
}) {
  try {
    return await request<{ id: string }>(`/pm/reports/prepare`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    return { id: 'mock-report-1' };
  }
}

export async function saveReportVersion(
  reportId: string,
  sections: ReportSectionData[],
  note?: string,
): Promise<ReportVersionDetail> {
  try {
    return await request<ReportVersionDetail>(`/pm/reports/${reportId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ sections, note }),
    });
  } catch {
    return {
      id: `ver-${Date.now()}`,
      version: '1.0',
      note: note ?? null,
      savedById: 'PM001',
      savedByName: 'Demo PM',
      savedAt: new Date().toISOString(),
      publishedById: null,
      publishedByName: null,
      publishedAt: null,
      sections,
    };
  }
}

export async function publishReport(
  reportId: string,
  params: { note?: string; sections?: ReportSectionData[] } = {},
): Promise<ReportVersionDetail> {
  try {
    return await request<ReportVersionDetail>(`/pm/reports/${reportId}/publish`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  } catch {
    return {
      id: `ver-${Date.now()}`,
      version: '1.0',
      note: params.note ?? null,
      savedById: 'PM001',
      savedByName: 'Demo PM',
      savedAt: new Date().toISOString(),
      publishedById: 'PM001',
      publishedByName: 'Demo PM',
      publishedAt: new Date().toISOString(),
      sections: params.sections ?? [],
    };
  }
}

export async function generatePdf(
  reportId: string,
  versionId: string,
): Promise<ReportFileDto> {
  try {
    return await request<ReportFileDto>(`/pm/reports/${reportId}/versions/${versionId}/pdf`, {
      method: 'POST',
    });
  } catch {
    return {
      id: `pdf-${Date.now()}`,
      versionId,
      filePath: `reports/BS23001_weekly_${Date.now()}.pdf`,
      generatedById: 'PM001',
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function sendReportEmail(
  reportId: string,
  payload: SendEmailPayload,
): Promise<MailDeliveryDto> {
  try {
    return await request<MailDeliveryDto>(`/pm/reports/${reportId}/emails`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      id: `mail-${Date.now()}`,
      purpose: 'REPORT',
      reportId,
      reportVersionId: 'ver-1',
      recipient: payload.recipient,
      subject: payload.subject,
      status: 'QUEUED',
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      mailAttempts: [],
    };
  }
}

export async function retryReportEmail(
  reportId: string,
  deliveryId: string,
): Promise<MailDeliveryDto> {
  return request<MailDeliveryDto>(`/pm/reports/${reportId}/emails/${deliveryId}/retry`, {
    method: 'POST',
  });
}

export async function getTraineeReports(): Promise<TraineePublishedReportItem[]> {
  try {
    return await request<TraineePublishedReportItem[]>(`/me/reports`, {
      method: 'GET',
    });
  } catch {
    return MOCK_TRAINEE_REPORTS;
  }
}

export async function getTraineeReportDetail(
  versionId: string,
): Promise<TraineePublishedReportDetail> {
  try {
    return await request<TraineePublishedReportDetail>(`/me/reports/${versionId}`, {
      method: 'GET',
    });
  } catch {
    return MOCK_TRAINEE_REPORT_DETAIL;
  }
}
