/**
 * The shapes the user-side sprint endpoints answer with.
 *
 * These live in `@bs23/contracts` now, so `apps/web` and `apps/api` share one definition and
 * cannot drift apart. This file re-exports them under the names the module has always used, so
 * every import inside the module keeps working and the API still answers exactly what it
 * answered before.
 *
 * The request DTOs (the class-validator ones) stay in `dto/sprint.dto.ts`: a validation class
 * cannot live in a shared type package.
 */

export type {
  SprintBoardView,
  SprintFigure,
  SprintHistoryItem,
  SprintHistoryView,
  SprintMeetingBannerView,
  SprintMeetingView,
  SprintReportRow,
  SprintReportType,
  SprintReportView,
  SprintSource,
  SprintSubmissionView,
  SprintSummaryDay,
  SprintSummaryView,
  SprintTaskCategory,
  SprintTaskView,
  SprintVerification,
  TaskOwnerView,
} from '@bs23/contracts';
