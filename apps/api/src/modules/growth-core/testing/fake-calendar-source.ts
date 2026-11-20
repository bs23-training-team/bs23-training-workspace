import type { CalendarSourcePort } from '../ports/calendar-source.port.js';
import type { Db } from '../ports/db.js';
import type { DayString } from '../time/org-time.js';

/** Returns the frozen days (leave, holidays) you set per user; none for anyone else. */
export class FakeCalendarSource implements CalendarSourcePort {
  private readonly byUser = new Map<string, Set<DayString>>();

  setFrozenDays(userId: string, days: DayString[]): void {
    this.byUser.set(userId, new Set(days));
  }

  async frozenDays(_db: Db, userId: string, _workspaceId: string): Promise<Set<DayString>> {
    return new Set(this.byUser.get(userId) ?? []);
  }
}
