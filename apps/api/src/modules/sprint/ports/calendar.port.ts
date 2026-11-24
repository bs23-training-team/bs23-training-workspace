import type { Tx } from './db.js';

/**
 * The working-day rule.
 *
 * The weekend is **Friday and Saturday** and Sunday is a working day (PRD BR-01, BR-02). A
 * public holiday is also not a working day. E07 owns holidays, so the holiday lookup lives
 * behind this port and the sprint module asks for "the previous working day" instead of
 * working it out itself.
 *
 * The rule that is certain and local — Friday and Saturday are the weekend — is implemented in
 * `time/org-time.ts` (`isWeekend`, `previousDaySkippingWeekend`). This port only adds the
 * holiday part on top.
 */
export interface CalendarPort {
  /**
   * The last working day strictly before `day`, or null when there is none.
   *
   * `day` is 'YYYY-MM-DD' in org time. A Friday or Saturday is skipped, and so is a public
   * holiday.
   */
  previousWorkingDay(tx: Tx, workspaceId: string, day: string): Promise<string | null>;

  /** True when the day is a working day (not Friday, not Saturday, not a public holiday). */
  isWorkingDay(tx: Tx, workspaceId: string, day: string): Promise<boolean>;
}

/** Nest injection token for the CalendarPort provider. */
export const CALENDAR = Symbol('SPRINT_CALENDAR');
