"use client";

import { type AttendanceRecord, type DB, type LeaveRequest, type Trainee } from "@/lib/mock/types";
import { addDays, isWeekend, todayISO } from "@/lib/utils";

/**
 * The one attendance day rule (PRD FR-ATT-08). Every screen that shows a day or a count uses it, so
 * the dashboards, the ERP tab and the tiles can never disagree. The first step that matches wins.
 * Absent is derived here and never stored.
 */
export type DayKind =
  | "off" // 1. weekend (Fri/Sat) or public holiday: not a working day
  | "outside" // 2. before onboarding or after the departure date: not counted
  | "present" // 3. ERP or PM-entered record
  | "late" // 3. record with late minutes
  | "leave" // 4. approved leave
  | "wfh" // 5. online user: work from home
  | "not-synced" // 6. the day has not ended, or no ERP sync after it has succeeded: not counted
  | "absent"; // 7. a working day with no record, no leave, and the ERP data is in

export interface DayStatus {
  kind: DayKind;
  record?: AttendanceRecord;
  leave?: LeaveRequest;
}

export function isPublicHoliday(db: DB, date: string): boolean {
  return db.publicHolidays.some((h) => h.date === date);
}

/**
 * Step 6 condition, kept in this one function. A day counts as synced once an ERP sync that finished
 * after the day ended has succeeded. To drop the sync condition, make this return `date < todayISO()`.
 */
function erpSyncedAfterDayEnd(db: DB, date: string): boolean {
  if (date >= todayISO()) return false; // the day has not ended
  const last = db.integrations.find((i) => i.key === "ERP")?.lastSync;
  return !!last && last.slice(0, 10) > date;
}

export function dayStatus(db: DB, t: Trainee, date: string): DayStatus {
  if (isWeekend(date) || isPublicHoliday(db, date)) return { kind: "off" };
  if (date < t.onboardDate || (t.periodEnd && date > t.periodEnd)) return { kind: "outside" };
  const record = db.attendance.find((a) => a.traineeUserId === t.userId && a.date === date);
  if (record) return { kind: record.lateMinutes > 0 ? "late" : "present", record };
  const leave = db.leaveRequests.find((l) => l.traineeUserId === t.userId && l.status === "APPROVED" && l.start <= date && l.end >= date);
  if (leave) return { kind: "leave", leave };
  if (t.attendanceMode === "ONLINE") return { kind: "wfh" };
  if (!erpSyncedAfterDayEnd(db, date)) return { kind: "not-synced" };
  return { kind: "absent" };
}

export const attendanceKind = (db: DB, t: Trainee, date: string): DayKind => dayStatus(db, t, date).kind;

export interface AttendanceTally {
  present: number; // Present and Work from home are separate figures
  late: number;
  wfh: number;
  absent: number;
  leave: number;
  /** Working days whose ERP data is not in yet. Not counted anywhere. */
  notSynced: number;
  /** Working days in scope (everything except off days and days outside the training period). */
  workdays: number;
  /** (present + late + wfh) ÷ (present + late + wfh + absent), whole percent; null ("No data") when the denominator is 0. */
  rate: number | null;
}

export function tallyAttendance(kinds: DayKind[]): AttendanceTally {
  const c = (k: DayKind) => kinds.filter((x) => x === k).length;
  const present = c("present");
  const late = c("late");
  const wfh = c("wfh");
  const absent = c("absent");
  const base = present + late + wfh + absent;
  return {
    present,
    late,
    wfh,
    absent,
    leave: c("leave"),
    notSynced: c("not-synced"),
    workdays: base + c("leave") + c("not-synced"),
    rate: base ? Math.round(((present + late + wfh) / base) * 100) : null,
  };
}

/** Dates from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
