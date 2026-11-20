import type { SprintSubmissionFact } from '../ports/sprint-source.port.js';
import { addDays, isWeekend, type DayString } from '../time/org-time.js';

export interface StreakResult {
  /** Consecutive working days, up to as-of, with a counted submission. */
  current: number;
  /** The longest such run in the whole history. */
  longest: number;
  /** The latest submission day up to as-of (any day, even one that did not count). */
  lastSubmissionDate: DayString | null;
}

/** 'ANY' counts every submission; 'ON_TIME' only on-time ones (for the on-time streak badge). */
export type StreakMode = 'ANY' | 'ON_TIME';

/**
 * Pure streak maths. Walks forward day by day:
 *  - weekend days (Friday, Saturday) and frozen days (approved leave, holidays, PM freezes)
 *    neither count nor break the run, and a submission on them does not count;
 *  - a working day with a counted submission adds 1;
 *  - a working day in the past with none resets the run;
 *  - today (as-of) with none yet does not reset it.
 * Submissions after as-of are ignored.
 */
export function computeStreak(
  submissions: SprintSubmissionFact[],
  frozenDays: ReadonlySet<DayString>,
  asOf: DayString,
  mode: StreakMode = 'ANY',
): StreakResult {
  const upToToday = submissions.filter((s) => s.day <= asOf);
  if (upToToday.length === 0) {
    return { current: 0, longest: 0, lastSubmissionDate: null };
  }
  const counted = new Set(upToToday.filter((s) => mode === 'ANY' || s.onTime).map((s) => s.day));
  const days = upToToday.map((s) => s.day);
  const first = days.reduce((a, b) => (a < b ? a : b));
  const last = days.reduce((a, b) => (a > b ? a : b));

  let run = 0;
  let longest = 0;
  for (let day = first; day <= asOf; day = addDays(day, 1)) {
    if (isWeekend(day) || frozenDays.has(day)) {
      continue; // neither counts nor breaks
    }
    if (counted.has(day)) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (day < asOf) {
      run = 0;
    }
  }
  return { current: run, longest, lastSubmissionDate: last };
}
