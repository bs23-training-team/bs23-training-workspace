"use client";

import { type Sector, type Position, type DB } from "@/lib/mock/types";
import { pmTrainees, pmPeople, traineeOf } from "@/lib/mock/selectors";
import { AttendanceTally, tallyAttendance, attendanceKind, daysBetween, isPublicHoliday, DayKind } from "@/features/attendance/day-rule";
import { todayISO, isWeekend } from "@/lib/utils";
import { courseProgress, assignmentsOf, courseById, versionForAssignment, isSubtopicDone, overallProgress } from "@/features/learning/mock-api";
import { attemptsFor, latestEvaluation, attemptPercent } from "@/features/assessment/mock-api";
import { suggestedCourses } from "@/features/catalog/mock-api";


export const SECTORS: { key: Sector; label: string; color: string }[] = [
  { key: "frontend", label: "Frontend", color: "#2f6fed" },
  { key: "backend", label: "Backend", color: "#8b5cf6" },
  { key: "fullstack", label: "Full-Stack", color: "#10b981" },
  { key: "sqa", label: "SQA", color: "#f59e0b" },
];

export const SECTOR_LABEL = Object.fromEntries(SECTORS.map((s) => [s.key, s.label])) as Record<Sector, string>;

export const SECTOR_COLOR = Object.fromEntries(SECTORS.map((s) => [s.key, s.color])) as Record<Sector, string>;

const POSITION_SECTOR: Record<Position, Sector> = { FRONTEND: "frontend", BACKEND: "backend", FULLSTACK: "fullstack", QA: "sqa" };

export const sectorOf = (p: Position): Sector => POSITION_SECTOR[p];

/** Growth % = ((Current − January) ÷ January) × 100. The only place this formula lives. */
export const growthPct = (current: number, base: number) => (base > 0 ? ((current - base) / base) * 100 : 0);

export interface SectorGrowthRow {
  key: Sector;
  label: string;
  color: string;
  trainees: number;
  /** Average skill score per month (same order as `months`). */
  values: number[];
  base: number;
  current: number;
  growth: number;
  /** Growth % per month relative to `base`. */
  growthSeries: number[];
}

/** Monthly sector snapshots → one row per sector. A missing month carries the previous value forward. */
export function sectorGrowth(db: DB, pmId: string): { months: string[]; rows: SectorGrowthRow[] } {
  const months = [...new Set(db.sectorSnapshots.map((s) => s.month))].sort();
  const active = pmTrainees(db, pmId);
  const rows = SECTORS.map(({ key, label, color }) => {
    const snaps = db.sectorSnapshots.filter((s) => s.sector === key);
    let last = snaps.sort((a, b) => a.month.localeCompare(b.month))[0]?.avgScore ?? 0;
    const values = months.map((m) => {
      last = snaps.find((s) => s.month === m)?.avgScore ?? last;
      return last;
    });
    const base = values[0] ?? 0;
    const current = values[values.length - 1] ?? 0;
    return { key, label, color, trainees: active.filter((t) => sectorOf(t.position) === key).length, values, base, current, growth: growthPct(current, base), growthSeries: values.map((v) => growthPct(v, base)) };
  });
  return { months, rows };
}

export interface PMDashboardData {
  today: string;
  isHoliday: boolean;
  total: number;
  active: number;
  inactive: number;
  suggested: number;
  pendingRequests: number;
  attendance: AttendanceTally;
  sectorCounts: { key: Sector; label: string; color: string; count: number }[];
  topPerformers: { userId: string; name: string; sector: Sector; marks: number; total: number }[];
  courses: { active: number; completed: number };
  exams: { submitted: number; inProgress: number; overdue: number };
  sprint: { done: number; notDone: number; eligible: number };
  growth: ReturnType<typeof sectorGrowth>;
}

export function pmDashboard(db: DB, pmId: string): PMDashboardData {
  const today = todayISO();
  const people = pmPeople(db, pmId);
  const active = pmTrainees(db, pmId);
  const ids = new Set(active.map((t) => t.userId));

  // course enrolments: an assignment is "completed" at 100% content, otherwise "active"
  const enrolments = db.assignments.filter((a) => ids.has(a.traineeUserId));
  const progress = (a: (typeof enrolments)[number]) => courseProgress(db, a.traineeUserId, a).contentPct;
  const completed = enrolments.filter((a) => progress(a) === 100).length;

  // exams per assignment × question set of that course
  const exams = { submitted: 0, inProgress: 0, overdue: 0 };
  for (const a of enrolments) {
    const started = progress(a) > 0;
    for (const set of db.questionSets.filter((q) => q.courseId === a.courseId)) {
      if (attemptsFor(db, a.traineeUserId, set.id).length) exams.submitted++;
      else if (a.dueDate && a.dueDate < today) exams.overdue++;
      else if (started) exams.inProgress++;
    }
  }

  const eligible = active.filter((t) => t.onboardDate <= today);
  const submitted = new Set(db.sprintSubmissions.filter((s) => s.date === today).map((s) => s.traineeUserId));
  const done = eligible.filter((t) => submitted.has(t.userId)).length;

  const topPerformers = active
    .flatMap((t) => {
      const ev = latestEvaluation(db, t.userId);
      if (!ev) return [];
      const total = ev.proctoring?.totalMarks ?? ev.total;
      const marks = ev.proctoring?.marksObtained ?? ev.score;
      return total > 0 ? [{ userId: t.userId, name: db.users.find((u) => u.id === t.userId)?.name ?? "Unknown", sector: sectorOf(t.position), marks, total }] : [];
    })
    .sort((a, b) => b.marks / b.total - a.marks / a.total || b.marks - a.marks || a.name.localeCompare(b.name))
    .slice(0, 3);

  return {
    today,
    isHoliday: isWeekend(today) || isPublicHoliday(db, today),
    total: people.length,
    active: active.length,
    inactive: people.length - active.length,
    suggested: active.reduce((n, t) => n + suggestedCourses(db, t.userId).filter((s) => !s.approved).length, 0),
    pendingRequests: db.courseRequests.filter((r) => r.status === "PENDING" && ids.has(r.traineeUserId)).length,
    attendance: tallyAttendance(active.map((t) => attendanceKind(db, t, today))),
    sectorCounts: SECTORS.map((s) => ({ ...s, count: active.filter((t) => sectorOf(t.position) === s.key).length })),
    topPerformers,
    courses: { active: enrolments.length - completed, completed },
    exams,
    sprint: { done, notDone: eligible.length - done, eligible: eligible.length },
    growth: sectorGrowth(db, pmId),
  };
}

export interface TraineeDashboardData {
  courses: { total: number; completed: number; inProgress: number; upcoming: number; overall: number };
  current: { courseId: string; title: string; pct: number; nextUp?: string; href: string } | null;
  assessments: { total: number; completed: number; upcoming: number; attempts: number; average: number | null; next: { title: string; href: string } | null };
  /** `notSyncedDays`: past working days this month whose ERP data is not in yet. Listed in a note, not counted. */
  attendance: AttendanceTally & { month: string; notSyncedDays: string[] };
}

export function traineeDashboard(db: DB, userId: string): TraineeDashboardData {
  const today = todayISO();
  const t = traineeOf(db, userId)!;
  const rows = assignmentsOf(db, userId).flatMap((a) => {
    const course = courseById(db, a.courseId);
    return course ? [{ a, course, p: courseProgress(db, userId, a) }] : [];
  });

  // courses: status by content %
  const inProgress = rows.filter((r) => r.p.contentPct > 0 && r.p.contentPct < 100);
  const currentRow = [...inProgress].sort((x, y) => (x.a.dueDate ?? "9999").localeCompare(y.a.dueDate ?? "9999"))[0];
  let current: TraineeDashboardData["current"] = null;
  if (currentRow) {
    const v = versionForAssignment(db, currentRow.a);
    const next = v?.topics.flatMap((tp) => tp.subtopics.map((s) => ({ tp, s }))).find((x) => !isSubtopicDone(db, userId, x.s.id));
    current = { courseId: currentRow.course.id, title: currentRow.course.title, pct: currentRow.p.contentPct, nextUp: next?.s.name, href: next ? `/trainee/roadmap/${currentRow.course.id}/${next.tp.id}/${next.s.id}` : `/trainee/roadmap/${currentRow.course.id}` };
  }

  // assessments: every question set in my assigned courses (roadmap order); pending-offline attempts are not scored yet
  const seen = new Set<string>();
  const sets = rows.flatMap((r) => db.questionSets.filter((q) => q.courseId === r.course.id)).filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
  const scored = (setId: string) => attemptsFor(db, userId, setId).filter((a) => a.status !== "PENDING_OFFLINE").map((a) => attemptPercent(a));
  const attempted = sets.filter((s) => scored(s.id).length);
  const allScores = sets.flatMap((s) => scored(s.id));
  const nextSet = sets.find((s) => !scored(s.id).length);

  // attendance: this month up to today, by the one day rule (FR-ATT-08)
  const monthStart = `${today.slice(0, 7)}-01`;
  const kinds: DayKind[] = [];
  const notSyncedDays: string[] = [];
  for (const d of daysBetween(monthStart, today)) {
    const k = attendanceKind(db, t, d);
    if (k === "not-synced" && d < today) notSyncedDays.push(d);
    kinds.push(k);
  }

  return {
    courses: { total: rows.length, completed: rows.filter((r) => r.p.contentPct === 100).length, inProgress: inProgress.length, upcoming: rows.filter((r) => r.p.contentPct === 0).length, overall: overallProgress(db, userId).contentPct },
    current,
    assessments: {
      total: sets.length,
      completed: attempted.length,
      upcoming: sets.length - attempted.length,
      attempts: allScores.length,
      average: allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null,
      next: nextSet ? { title: nextSet.title.startsWith(courseById(db, nextSet.courseId)?.title ?? "\0") ? nextSet.title : `${courseById(db, nextSet.courseId)?.title ?? "Course"} – ${nextSet.title}`, href: `/trainee/assessments/${nextSet.id}` } : null,
    },
    attendance: { ...tallyAttendance(kinds), notSyncedDays, month: new Date(`${monthStart}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) },
  };
}
