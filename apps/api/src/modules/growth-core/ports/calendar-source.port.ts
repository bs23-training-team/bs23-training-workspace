import type { DayString } from '../time/org-time.js';
import type { Db } from './db.js';

/**
 * Read-only port to the attendance module (E07): days that neither count toward nor break
 * a streak. Approved leave and public holidays come from here; PM streak freezes are
 * growth-core's own data and are merged in by the streak service.
 */
export interface CalendarSourcePort {
  frozenDays(db: Db, userId: string, workspaceId: string): Promise<Set<DayString>>;
}
