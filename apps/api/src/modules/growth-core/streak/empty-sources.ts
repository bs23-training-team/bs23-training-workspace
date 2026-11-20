import type { CalendarSourcePort } from '../ports/calendar-source.port.js';
import type { DayString } from '../time/org-time.js';
import type { SprintSourcePort, SprintSubmissionFact } from '../ports/sprint-source.port.js';

/**
 * Stand-ins until the sprint module (E06) and the attendance module (E07) provide the real
 * sources. They report nothing, so every streak is 0 until then. Swap the providers in
 * growth-core.module.ts; no other code changes.
 */
export class EmptySprintSource implements SprintSourcePort {
  async submissionsOf(): Promise<SprintSubmissionFact[]> {
    return [];
  }
}

export class EmptyCalendarSource implements CalendarSourcePort {
  async frozenDays(): Promise<Set<DayString>> {
    return new Set();
  }
}
