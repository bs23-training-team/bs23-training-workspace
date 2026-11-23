// Owner: E08. Types shared by apps/api and apps/web for the reports module.
// Already re-exported from src/index.ts: do not edit that file.

export const REPORT_SECTION_NAMES = [
  'Skill analysis result',
  'Courses result',
  'Proctoring result',
  'L&D feedback',
  'Attendance',
  'Gamification',
  'Sprint',
] as const;

export type ReportSectionName = (typeof REPORT_SECTION_NAMES)[number];

export type ReportPeriodTypeDto = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'FULL';

export type ReportSourceStatus = 'connected' | 'sample' | 'PM-entered' | 'unavailable';

export type MailStatusDto = 'QUEUED' | 'ACCEPTED' | 'FAILED';

export type MailPurposeDto = 'REPORT' | 'TASK_OWNER_APPROVAL';

export interface ReportEvidenceLine {
  label: string;
  value: string;
  source: ReportSourceStatus;
  note?: string;
}

export interface ReportSectionData {
  name: ReportSectionName;
  lines: ReportEvidenceLine[];
  pmNote: string;
}

export interface ReportDailyLatePoint {
  date: string;
  lateMinutes: number | null;
}

export interface ReportVisualSummary {
  contentCompletionPct: number;
  verifiedMasteryPct: number;
  assessmentAveragePct: number | null;
  finalResultsCount: number;
  sprintOnTimeRatePct: number | null;
  officeLateMinutes: ReportDailyLatePoint[];
  meetingLateMinutes: ReportDailyLatePoint[];
}

export interface ReportVersionSummary {
  id: string;
  version: string;
  note: string | null;
  savedById: string;
  savedByName: string;
  savedAt: string;
  publishedById: string | null;
  publishedByName: string | null;
  publishedAt: string | null;
}

export interface ReportVersionDetail extends ReportVersionSummary {
  sections: ReportSectionData[];
}

export interface ReportFileDto {
  id: string;
  versionId: string;
  filePath: string;
  generatedById: string;
  generatedAt: string;
}

export interface MailAttemptDto {
  id: string;
  attemptNo: number;
  status: MailStatusDto;
  error: string | null;
  attemptedAt: string;
}

export interface MailDeliveryDto {
  id: string;
  purpose: MailPurposeDto;
  reportId: string | null;
  reportVersionId: string | null;
  recipient: string;
  subject: string;
  status: MailStatusDto;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  mailAttempts: MailAttemptDto[];
}

export interface ReportUserSummary {
  userId: string;
  name: string;
  onboardDate: string;
  departureDate: string | null;
  archivedAt: string | null;
}

export interface ReportPeriodInfo {
  periodType: ReportPeriodTypeDto;
  periodStart: string;
  periodEnd: string;
  inTrainingPeriod: boolean;
  outsidePeriodReason: string | null;
}

export interface PmReportRecord {
  id: string;
  userId: string;
  periodType: ReportPeriodTypeDto;
  periodStart: string;
  periodEnd: string;
  sections: ReportSectionData[];
  updatedAt: string;
}

export interface PmReportResponse {
  report: PmReportRecord | null;
  user: ReportUserSummary;
  period: ReportPeriodInfo;
  visualSummary: ReportVisualSummary;
  liveSections: ReportSectionData[];
  versions: ReportVersionSummary[];
  mailDeliveries: MailDeliveryDto[];
}

export interface TraineePublishedReportItem {
  versionId: string;
  reportId: string;
  version: string;
  periodType: ReportPeriodTypeDto;
  periodStart: string;
  periodEnd: string;
  publishedById: string;
  publishedByName: string;
  publishedAt: string;
}

export interface TraineePublishedReportDetail extends TraineePublishedReportItem {
  sections: ReportSectionData[];
  visualSummary: ReportVisualSummary;
}

export interface PrepareReportInput {
  userId: string;
  periodType: ReportPeriodTypeDto;
  periodStart: string;
  periodEnd: string;
}

export interface SaveReportVersionInput {
  sections: ReportSectionData[];
  note?: string;
}

export interface PublishReportInput {
  sections?: ReportSectionData[];
  note?: string;
}

export interface SendReportEmailInput {
  reportVersionId?: string;
  recipient: string;
  subject: string;
  message: string;
}
