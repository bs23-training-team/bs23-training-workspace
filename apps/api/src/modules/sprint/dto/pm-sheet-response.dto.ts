/**
 * The shapes the PM-side sheet endpoints answer with.
 *
 * These live in `@bs23/contracts` now, so `apps/web` and `apps/api` share one definition and
 * cannot drift apart. This file re-exports them under the names the module has always used, so
 * every import inside the module keeps working and the API still answers exactly what it
 * answered before.
 */

export type {
  SprintCellSource,
  SprintSavedCellView,
  SprintSheetCellView,
  SprintSheetColumn,
  SprintSheetDayView,
  SprintSheetRowView,
  SprintSheetView,
  SprintWeekView,
} from '@bs23/contracts';

/**
 * The names the module has always used, kept as aliases.
 *
 * The shared types carry a `Sprint` prefix so they cannot collide with another module's
 * types in the flat `@bs23/contracts` barrel. Inside the module the shorter names read
 * better, so they are aliased here rather than renamed in every file.
 */
export type {
  SprintSavedCellView as SavedCellView,
  SprintSheetCellView as SheetCellView,
  SprintSheetColumn as SheetColumnValue,
  SprintSheetDayView as SheetDayView,
  SprintSheetRowView as SheetRowView,
} from '@bs23/contracts';
