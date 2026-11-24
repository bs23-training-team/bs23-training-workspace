/**
 * Org-time helpers: the one place that does time-zone and week maths for the sprint module.
 * No other file computes a day, a week or a cutoff.
 *
 * Org time is Asia/Dhaka: UTC+6 all year, no daylight saving, so a fixed offset is exact.
 * A "day" is a 'YYYY-MM-DD' string. A sprint week runs Monday to Sunday; the weekend is
 * Friday and Saturday (PRD: a sprint week starts on Monday, and Sunday is the last day of
 * the week and a working day).
 *
 * This is deliberately the same shape as the growth-core module's time/org-time.ts, so the
 * two modules never disagree about which day it is.
 */

/** A calendar day, 'YYYY-MM-DD'. */
export type DayString = string;

export interface OrgLocal {
  day: DayString;
  hour: number;
  minute: number;
  second: number;
}

/** Asia/Dhaka is UTC+6 with no daylight saving. */
export const ORG_UTC_OFFSET_HOURS = 6;
export const ORG_UTC_OFFSET_MS = ORG_UTC_OFFSET_HOURS * 60 * 60 * 1000;

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

/** True when the string is a real 'YYYY-MM-DD' calendar date. */
export function isDayString(value: unknown): value is DayString {
  if (typeof value !== 'string') return false;
  try {
    parseDay(value);
    return true;
  } catch {
    return false;
  }
}

/** The local Dhaka day, hour, minute and second of a UTC instant. */
export function toOrgLocal(instant: Date): OrgLocal {
  const local = new Date(instant.getTime() + ORG_UTC_OFFSET_MS);
  return {
    day: formatDay(local),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
    second: local.getUTCSeconds(),
  };
}

/** Today's date in org time. */
export function orgToday(now: Date): DayString {
  return toOrgLocal(now).day;
}

/** The day 'days' after the given day. */
export function addDays(day: DayString, days: number): DayString {
  return formatDay(new Date(parseDay(day).getTime() + days * DAY_MS));
}

/** Day of the week for a day string: 0 = Sunday ... 6 = Saturday. */
function weekday(day: DayString): number {
  return parseDay(day).getUTCDay();
}

/** The Monday of the week that contains the day. */
export function weekStart(day: DayString): DayString {
  const sinceMonday = (weekday(day) + 6) % 7; // Monday 0 ... Sunday 6
  return addDays(day, -sinceMonday);
}

/** The Sunday of the week that contains the day. */
export function weekEnd(day: DayString): DayString {
  return addDays(weekStart(day), 6);
}

/** The seven days of the sprint week that contains the day, Monday first. */
export function weekDays(day: DayString): DayString[] {
  const monday = weekStart(day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** Friday and Saturday are the weekend; Sunday is a working day. */
export function isWeekend(day: DayString): boolean {
  const d = weekday(day);
  return d === 5 || d === 6;
}

/** True when the day is a Monday, the only day a sprint week may start on. */
export function isMonday(day: DayString): boolean {
  return weekday(day) === 1;
}

// -----------------------------------------------------------------------------
// The report week
// -----------------------------------------------------------------------------

/**
 * The report week: **Sunday through Friday**, with **only Saturday** off.
 *
 * This is a **different calendar** from the sprint week above, and the two must not be
 * confused:
 *
 * | | first day | last day | off days |
 * |---|---|---|---|
 * | the **sprint week** (`SprintWeek`, P1–P5) | Monday | Sunday | Friday and Saturday |
 * | the **report week** (P6) | **Sunday** | **Friday** | **Saturday only** |
 *
 * The sprint week stays exactly as it is: `SprintWeek.weekStart` is still a Monday and the
 * database still refuses a week that does not start on one (CHECK
 * `chk_sprintweek_monday`). The report week exists only for the **report window** (P6), so
 * changing it cannot move a sprint week.
 *
 * The two calendars are offset by a day at each end, so a report week covers six **active**
 * days (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday) and Saturday is the gap
 * between one report week and the next.
 */

/** The day of the week for a day string: 0 = Sunday ... 6 = Saturday. */
function reportWeekday(day: DayString): number {
  return weekday(day);
}

/** True when the day is a Saturday — the only off day of a report week. */
export function isReportVacationDay(day: DayString): boolean {
  return reportWeekday(day) === 6;
}

/**
 * The Sunday that starts the report week that contains the day.
 *
 * The report week runs Sunday → Friday, so a day belongs to the week that starts on the
 * **most recent Sunday**. A Saturday belongs to the week that started the day before it —
 * Saturday is the off day *of* that week, and it is the gap before the next Sunday.
 */
export function reportWeekStart(day: DayString): DayString {
  const sinceSunday = reportWeekday(day); // Sunday 0 ... Saturday 6
  return addDays(day, -sinceSunday);
}

/**
 * The Friday that ends the report week that contains the day.
 */
export function reportWeekEnd(day: DayString): DayString {
  return addDays(reportWeekStart(day), 5);
}

/**
 * The active days of the report week that contains the day — Sunday to Friday, Saturday
 * excluded.
 *
 * Six days: Sunday, Monday, Tuesday, Wednesday, Thursday and Friday.
 */
export function reportWeekDays(day: DayString): DayString[] {
  const sunday = reportWeekStart(day);
  return Array.from({ length: 6 }, (_, index) => addDays(sunday, index));
}

/**
 * The first day of the calendar month that contains the day.
 *
 * A month is not a sprint week, so the monthly report is a calendar month rather than a number
 * of weeks (Phase 7, ASSUMPTIONS L1).
 */
export function monthStart(day: DayString): DayString {
  const date = parseDay(day);
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

/**
 * The last day of the calendar month that contains the day.
 *
 * It is the day before the first of the next month, so February in a leap year ends on the
 * 29th and every other month gets its own length.
 */
export function monthEnd(day: DayString): DayString {
  const date = parseDay(day);
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/**
 * The previous calendar day, without asking about holidays. Friday and Saturday are skipped:
 * the previous working day of Sunday is Thursday (PRD: the weekend is Friday and Saturday).
 */
export function previousDaySkippingWeekend(day: DayString): DayString {
  let candidate = addDays(day, -1);
  while (isWeekend(candidate)) {
    candidate = addDays(candidate, -1);
  }
  return candidate;
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

/** The cutoff "HH:MM" as minutes after midnight. Throws when the format is wrong. */
export function cutoffMinutes(cutoff: string): number {
  const match = TIME_PATTERN.exec(cutoff);
  if (!match) {
    throw new Error(`Invalid cutoff "${cutoff}": expected HH:MM`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}
