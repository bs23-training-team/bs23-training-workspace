/**
 * Org-time helpers: the one place that does time-zone and week maths for gamification.
 * No other file should compute a day, a week or a cutoff.
 *
 * Org time is Asia/Dhaka: UTC+6 all year, no daylight saving, so a fixed offset is exact.
 * A "day" is a 'YYYY-MM-DD' string. A week runs Monday to Sunday; the weekend is
 * Friday and Saturday (PRD: a sprint week starts on Monday).
 */

export type DayString = string; // 'YYYY-MM-DD'

export interface OrgLocal {
  day: DayString;
  hour: number;
  minute: number;
}

const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number): string => String(n).padStart(2, '0');

function formatDay(date: Date): DayString {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** 'YYYY-MM-DD' to UTC midnight, which is what a @db.Date column holds. Throws if invalid. */
export function parseDay(day: DayString): Date {
  const match = DAY_PATTERN.exec(day);
  if (!match) {
    throw new Error(`Invalid day "${day}": expected YYYY-MM-DD`);
  }
  const date = new Date(`${day}T00:00:00Z`);
  // Rejects dates JavaScript would roll over, such as 2026-02-30.
  if (Number.isNaN(date.getTime()) || formatDay(date) !== day) {
    throw new Error(`Invalid day "${day}": not a real calendar date`);
  }
  return date;
}

/** The local Dhaka day, hour and minute of a UTC instant. */
export function toOrgLocal(instant: Date): OrgLocal {
  const local = new Date(instant.getTime() + OFFSET_MS);
  return { day: formatDay(local), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

/** Today's date in org time. */
export function orgToday(now: Date): DayString {
  return toOrgLocal(now).day;
}

export function addDays(day: DayString, days: number): DayString {
  return formatDay(new Date(parseDay(day).getTime() + days * DAY_MS));
}

/** Day of the week for a day string: 0 = Sunday ... 6 = Saturday. */
function weekday(day: DayString): number {
  return parseDay(day).getUTCDay();
}

/** The Monday of the week that contains `day`. */
export function weekStart(day: DayString): DayString {
  const sinceMonday = (weekday(day) + 6) % 7; // Monday 0 ... Sunday 6
  return addDays(day, -sinceMonday);
}

/** The Sunday of the week that contains `day`. */
export function weekEnd(day: DayString): DayString {
  return addDays(weekStart(day), 6);
}

/** Friday and Saturday are the weekend; Sunday is a working day. */
export function isWeekend(day: DayString): boolean {
  const d = weekday(day);
  return d === 5 || d === 6;
}

/**
 * True when the submission is strictly before the cutoff ("HH:MM") on its own Dhaka day.
 * 09:59 is on time for a 10:00 cutoff; 10:00 itself is not.
 */
export function isBeforeCutoff(submittedAt: Date, cutoff: string): boolean {
  const match = TIME_PATTERN.exec(cutoff);
  if (!match) {
    throw new Error(`Invalid cutoff "${cutoff}": expected HH:MM`);
  }
  const cutoffMinutes = Number(match[1]) * 60 + Number(match[2]);
  const local = toOrgLocal(submittedAt);
  return local.hour * 60 + local.minute < cutoffMinutes;
}
