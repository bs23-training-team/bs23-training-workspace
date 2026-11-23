/**
 * API client for E08 (Reports) feature.
 * Communicates with the NestJS API (default: http://localhost:4000).
 * Standard auth: uses session / cookie (credentials: 'include').
 * Security: does NOT send spoofable x-actor-* or x-workspace-id headers.
 * Mock data: used for reads ONLY when NEXT_PUBLIC_USE_MOCKS=true is explicitly set.
 * Writes always call the real API and surface real errors on failure.
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

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

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
  if (USE_MOCKS) {
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

  const query = new URLSearchParams({
    userId: params.userId,
    periodType: params.periodType,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  return request<PmReportResponse>(`/pm/reports?${query.toString()}`, {
    method: 'GET',
  });
}

export async function prepareReport(params: {
  userId: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
}) {
  return request<{ id: string }>(`/pm/reports/prepare`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function saveReportVersion(
  reportId: string,
  sections: ReportSectionData[],
  note?: string,
): Promise<ReportVersionDetail> {
  return request<ReportVersionDetail>(`/pm/reports/${reportId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ sections, note }),
  });
}

export async function publishReport(
  reportId: string,
  params: { note?: string; sections?: ReportSectionData[] } = {},
): Promise<ReportVersionDetail> {
  return request<ReportVersionDetail>(`/pm/reports/${reportId}/publish`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function generatePdf(
  reportId: string,
  versionId: string,
): Promise<ReportFileDto> {
  return request<ReportFileDto>(`/pm/reports/${reportId}/versions/${versionId}/pdf`, {
    method: 'POST',
  });
}

export async function sendReportEmail(
  reportId: string,
  payload: SendEmailPayload,
): Promise<MailDeliveryDto> {
  return request<MailDeliveryDto>(`/pm/reports/${reportId}/emails`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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
  if (USE_MOCKS) {
    return MOCK_TRAINEE_REPORTS;
  }

  return request<TraineePublishedReportItem[]>(`/me/reports`, {
    method: 'GET',
  });
}

export async function getTraineeReportDetail(
  versionId: string,
): Promise<TraineePublishedReportDetail> {
  if (USE_MOCKS) {
    return MOCK_TRAINEE_REPORT_DETAIL;
  }

  return request<TraineePublishedReportDetail>(`/me/reports/${versionId}`, {
    method: 'GET',
  });
}
