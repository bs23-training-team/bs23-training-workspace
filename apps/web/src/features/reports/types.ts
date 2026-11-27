/**
 * Frontend types for E08 (Reports) feature.
 * Matches backend contracts in @bs23/contracts/reports.
 */

export type ReportPeriodType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'FULL';
export type ReportLineSource = 'connected' | 'sample' | 'PM-entered' | 'unavailable';

export interface ReportLineData {
  label: string;
  value: string;
  source: ReportLineSource;
  note?: string;
}

export type ReportSectionName =
  | 'Skill analysis result'
  | 'Courses result'
  | 'Proctoring result'
  | 'RND feedback'
  | 'Attendance'
  | 'Gamification'
  | 'Sprint';

export const REPORT_SECTION_NAMES: readonly ReportSectionName[] = [
  'Skill analysis result',
  'Courses result',
  'Proctoring result',
  'RND feedback',
  'Attendance',
  'Gamification',
  'Sprint',
] as const;

export interface ReportSectionData {
  name: ReportSectionName;
  lines: ReportLineData[];
  pmNote: string;
}

export interface ReportVisualSummary {
  contentCompletionPct: number;
  verifiedMasteryPct: number;
  assessmentAveragePct: number | null;
  finalResultsCount: number;
  sprintOnTimeRatePct: number | null;
  officeLateMinutes: number[];
  meetingLateMinutes: number[];
}

export interface ReportVersionDetail {
  id: string;
  version: string;
  note: string | null;
  savedById: string;
  savedByName: string;
  savedAt: string;
  publishedById: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
  sections: ReportSectionData[];
}

export interface MailAttemptDto {
  id: string;
  attemptNo: number;
  status: string;
  error: string | null;
  attemptedAt: string;
}

export interface MailDeliveryDto {
  id: string;
  purpose: string;
  reportId: string;
  reportVersionId: string;
  recipient: string;
  subject: string;
  status: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  mailAttempts: MailAttemptDto[];
}

export interface ReportFileDto {
  id: string;
  versionId: string;
  filePath: string;
  generatedById: string;
  generatedAt: string;
}

export interface PmReportResponse {
  report: {
    id: string;
    userId: string;
    periodType: ReportPeriodType;
    periodStart: string;
    periodEnd: string;
    updatedAt: string;
  } | null;
  user: {
    userId: string;
    name: string;
    onboardDate: string;
    departureDate: string | null;
    archivedAt: string | null;
  };
  period: {
    periodType: ReportPeriodType;
    periodStart: string;
    periodEnd: string;
    inTrainingPeriod: boolean;
    outsidePeriodReason: string | null;
  };
  visualSummary: ReportVisualSummary;
  liveSections: ReportSectionData[];
  versions: ReportVersionDetail[];
  mailDeliveries: MailDeliveryDto[];
}

export interface TraineePublishedReportItem {
  versionId: string;
  reportId: string;
  version: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
  publishedById: string;
  publishedByName: string;
  publishedAt: string;
}

export interface TraineePublishedReportDetail {
  versionId: string;
  reportId: string;
  version: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
  publishedById: string;
  publishedByName: string;
  publishedAt: string;
  sections: ReportSectionData[];
  visualSummary: ReportVisualSummary;
}

export interface SendEmailPayload {
  recipient: string;
  subject: string;
  message: string;
}
