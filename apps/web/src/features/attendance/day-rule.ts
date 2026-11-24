"use client";

import { type DB, type Trainee } from "@/lib/mock/types";
import { isWeekend } from "@/lib/utils";


/**
 * What the ERP data says about one trainee on one day. Same rules as the ERP attendance tab:
 * a working day with no record is "none" (no ERP data) and is NEVER counted as absence.
 */
export type DayKind = "present" | "late" | "wfh" | "leave" | "holiday" | "none";

export function attendanceKind(db: DB, t: Trainee, date: string): DayKind | null {
  if (date < t.onboardDate) return null;
  if (isWeekend(date)) return "holiday";
  const rec = db.attendance.find((a) => a.traineeUserId === t.userId && a.date === date);
  if (rec) return rec.lateMinutes > 0 ? "late" : "present";
  if (db.leaveRequests.some((l) => l.traineeUserId === t.userId && l.status === "APPROVED" && l.start <= date && l.end >= date)) return "leave";
  if (t.attendanceMode === "ONLINE") return "wfh"; // online trainees work from home (not in ERP)
  return "none";
}

export interface AttendanceTally {
  present: number; // includes work-from-home
  late: number;
  /** Always 0 today: absence is not recorded anywhere, and missing ERP data is not absence. */
  absent: number;
  leave: number;
  noData: number;
  workdays: number;
  /** (present + late) ÷ (present + late + absent); null when there is nothing to measure. */
  rate: number | null;
}

export function tallyAttendance(kinds: (DayKind | null)[]): AttendanceTally {
  const c = (k: DayKind) => kinds.filter((x) => x === k).length;
  const present = c("present") + c("wfh");
  const late = c("late");
  const absent = 0;
  const base = present + late + absent;
  return { present, late, absent, leave: c("leave"), noData: c("none"), workdays: kinds.filter((k) => k && k !== "holiday").length, rate: base ? Math.round(((present + late) / base) * 100) : null };
}
