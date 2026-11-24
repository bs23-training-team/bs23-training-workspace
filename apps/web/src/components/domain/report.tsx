"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { DB, Report, SourceStatus } from "@/lib/types";
import { assignmentsOf, attemptPercent, courseById, courseProgress, latestEvaluation, levelFor, nameOf, overallProgress, streakOf, traineeOf, xpTotal } from "@/lib/api";
import { REPORT_SECTIONS } from "@/lib/content";
import { Card, ProgressRing, SourceBadge, Textarea } from "@/components/ui/ui";
import { BarChart } from "@/components/ui/charts";
import { addDays, cn, isWeekend, parseISODate } from "@/lib/utils";

interface Line {
  label: string;
  value: string;
  source: SourceStatus;
}

function workingDays(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) out.push(d);
  return out;
}

/** Evidence per report section, every figure labelled by source status (FR-RPT-03). */
export function reportEvidence(db: DB, traineeUserId: string, start: string, end: string): Record<string, Line[]> {
  const t = traineeOf(db, traineeUserId)!;
  const from = start < t.onboardDate ? t.onboardDate : start;
  const days = from <= end ? workingDays(from, end) : [];
  const att = db.attendance.filter((a) => a.traineeUserId === traineeUserId && a.date >= from && a.date <= end);
  const meet = db.meetingAttendance.filter((m) => m.traineeUserId === traineeUserId && m.scheduledStart.slice(0, 10) >= from && m.scheduledStart.slice(0, 10) <= end);
  const subs = db.sprintSubmissions.filter((s) => s.traineeUserId === traineeUserId && s.date >= from && s.date <= end);
  const attempts = db.attempts.filter((a) => a.traineeUserId === traineeUserId && a.submittedAt.slice(0, 10) >= from && a.submittedAt.slice(0, 10) <= end);
  const lessons = db.subtopicProgress.filter((p) => p.traineeUserId === traineeUserId && p.completedAt >= from && p.completedAt <= end);
  const leave = db.leaveRequests.filter((l) => l.traineeUserId === traineeUserId && l.status === "APPROVED" && l.end >= from && l.start <= end);
  const ev = latestEvaluation(db, traineeUserId);
  const fb = db.feedback.filter((f) => f.traineeUserId === traineeUserId).sort((a, b) => b.version - a.version)[0];
  const xp = db.xpEvents.filter((e) => e.traineeUserId === traineeUserId && e.status === "AWARDED" && e.date >= from && e.date <= end).reduce((s, e) => s + e.amount, 0);
  const una = (label: string): Line => ({ label, value: "Data unavailable for this period", source: "unavailable" });
  const physical = t.attendanceMode === "PHYSICAL";
  const attSource: SourceStatus = att.some((a) => a.source === "PM_ENTERED") ? "PM-entered" : "sample";

  const lv = levelFor(db, xpTotal(db, traineeUserId));
  const earned = db.badgeAwards.filter((b) => b.traineeUserId === traineeUserId).map((b) => db.badges.find((x) => x.id === b.badgeId)?.name).filter(Boolean);
  const weak = ev ? ev.results.filter((r) => r.status === "Needs revision" || r.status === "Developing") : [];
  const onTimeRate = subs.length ? `${Math.round((subs.filter((s) => s.onTime).length / subs.length) * 100)}%` : "unavailable";
  const courseLines: Line[] = assignmentsOf(db, traineeUserId).length
    ? assignmentsOf(db, traineeUserId).map((a) => {
        const p = courseProgress(db, traineeUserId, a);
        return { label: courseById(db, a.courseId)?.title ?? a.courseId, value: `Content ${p.contentPct}% · mastery ${p.masteryPct}%`, source: "connected" as SourceStatus };
      })
    : [una("Courses")];
  const proctored = attempts.filter((a) => a.integrityEvents.length > 0);

  return {
    "Skill analysis result": ev
      ? [
          { label: "Initial evaluation", value: `${ev.level} · ${ev.score}/${ev.total} correct`, source: "connected" },
          ...ev.results.map((r) => ({ label: r.technology, value: `${r.status} · ${r.priority} priority`, source: "connected" as SourceStatus })),
          { label: "Weak concepts", value: weak.length ? weak.map((r) => r.technology).join(", ") : "None", source: "connected" },
        ]
      : [una("Skill analysis")],
    "Courses result": [
      ...courseLines,
      { label: "Lessons completed in period", value: String(lessons.length), source: "connected" },
      ...(attempts.length
        ? attempts.map((a) => {
            const set = db.questionSets.find((q) => q.id === a.questionSetId);
            return { label: `Assessment — ${set?.title ?? a.questionSetId}`, value: `${attemptPercent(a)}% · ${a.status === "FINAL" ? "Final" : "Provisional"}`, source: "connected" as SourceStatus };
          })
        : [una("Assessments")]),
    ],
    "Proctoring result": attempts.length
      ? [
          { label: "Assessments taken in period", value: String(attempts.length), source: "connected" },
          { label: "Assessments with integrity events", value: String(proctored.length), source: "connected" },
          ...proctored.map((a) => ({
            label: db.questionSets.find((q) => q.id === a.questionSetId)?.title ?? a.questionSetId,
            value: a.integrityEvents.map((e) => e.type.replace(/_/g, " ").toLowerCase()).join(", "),
            source: "connected" as SourceStatus,
          })),
        ]
      : [una("Proctoring")],
    "L&D feedback": fb
      ? [
          { label: `Feedback v${fb.version}`, value: fb.text, source: "PM-entered" },
          { label: "Reviewed by", value: nameOf(db, fb.authorId), source: "PM-entered" },
        ]
      : [una("L&D feedback")],
    Attendance: [
      physical && att.length
        ? { label: "Office days with ERP record", value: `${att.length} of ${days.length} working days`, source: attSource }
        : physical
          ? una("Office attendance")
          : { label: "Office attendance", value: "Online user — not expected", source: "sample" },
      ...(physical && att.length
        ? [
            { label: "Late arrivals", value: `${att.filter((a) => a.lateMinutes > 0).length} day(s)`, source: attSource },
            { label: "Missing checkout (Unknown)", value: `${att.filter((a) => !a.exit).length} day(s)`, source: attSource },
            { label: "Days without ERP data (not absence)", value: `${days.filter((d) => d < end && !att.some((a) => a.date === d)).length}`, source: "unavailable" as SourceStatus },
          ]
        : []),
      meet.length ? { label: "Teams meetings attended", value: `${meet.filter((m) => m.status === "ATTENDED").length} attended · ${meet.filter((m) => m.status === "REPORT_PENDING").length} report pending`, source: "sample" } : una("Teams meetings"),
      { label: "Approved leave", value: leave.length ? leave.map((l) => `${l.start} → ${l.end}`).join(", ") : "None", source: "connected" },
    ],
    Gamification: [
      { label: "Award XP in period (engagement only, not a performance rating)", value: `${xp} XP`, source: "connected" },
      { label: "Total XP", value: `${xpTotal(db, traineeUserId)} XP`, source: "connected" },
      { label: "Level & streak", value: `${lv.level.name} · ${streakOf(db, traineeUserId)}-day streak`, source: "connected" },
      { label: "Badges", value: earned.length ? earned.join(", ") : "None earned yet", source: "connected" },
    ],
    Sprint: subs.length ? [{ label: "Sprint submissions", value: `${subs.length} · ${subs.filter((s) => s.onTime).length} on time (${onTimeRate})`, source: "connected" }] : [una("Sprint submissions")],
  };
}

export function ReportVisualSummary({ db, traineeUserId, start, end }: { db: DB; traineeUserId: string; start: string; end: string }) {
  const t = traineeOf(db, traineeUserId)!;
  const from = start < t.onboardDate ? t.onboardDate : start;
  const days = from <= end ? workingDays(from, end).slice(-10) : [];
  const ov = overallProgress(db, traineeUserId);
  const at = db.attempts.filter((a) => a.traineeUserId === traineeUserId);
  const subs = db.sprintSubmissions.filter((s) => s.traineeUserId === traineeUserId && s.date >= from && s.date <= end);
  const lbl = (d: string) => parseISODate(d).toLocaleDateString("en-GB", { day: "numeric", month: "numeric" });
  const office = days.map((d) => {
    const r = db.attendance.find((a) => a.traineeUserId === traineeUserId && a.date === d);
    return { label: lbl(d), value: r ? r.lateMinutes : null };
  });
  const meetings = days.map((d) => {
    const m = db.meetingAttendance.find((x) => x.traineeUserId === traineeUserId && x.scheduledStart.startsWith(d));
    return { label: lbl(d), value: m && m.lateMinutes != null ? m.lateMinutes : null };
  });
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="Content completion">
        <div className="flex justify-center">
          <ProgressRing value={ov.contentPct} label="Content" sublabel={`Verified mastery ${ov.masteryPct}%`} />
        </div>
      </Card>
      <Card title="Performance snapshot">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Assessment average</dt>
            <dd className="font-medium">{at.length ? `${Math.round(at.reduce((s, a) => s + attemptPercent(a), 0) / at.length)}%` : "Unavailable"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Final results</dt>
            <dd className="font-medium">{at.filter((a) => a.status === "FINAL").length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Sprint on-time rate</dt>
            <dd className="font-medium">{subs.length ? `${Math.round((subs.filter((s) => s.onTime).length / subs.length) * 100)}%` : "Unavailable"}</dd>
          </div>
        </dl>
      </Card>
      <Card title="Punctuality" description="Late minutes per day. n/a = data unavailable (not absence).">
        <p className="mb-1 text-xs font-medium text-muted">Office (ERP)</p>
        <BarChart data={office} unit="m" height={90} label="Office late minutes" />
        <p className="mb-1 mt-3 text-xs font-medium text-muted">Meetings (Teams)</p>
        <BarChart data={meetings} unit="m" height={90} label="Meeting late minutes" />
      </Card>
    </div>
  );
}

const sectionId = (i: number) => `report-section-${i}`;

/**
 * Report sections numbered 1…N. With `withIndex` a sticky index on the right highlights the
 * section being read (PM report view). `sectionActions` renders extra controls inside a section.
 */
export function ReportSections({
  db,
  report,
  sections,
  onChange,
  withIndex,
  sectionActions,
}: {
  db: DB;
  report: Report;
  sections: Record<string, string>;
  onChange?: (s: Record<string, string>) => void;
  withIndex?: boolean;
  sectionActions?: Record<string, ReactNode>;
}) {
  const evidence = reportEvidence(db, report.traineeUserId, report.periodStart, report.periodEnd);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!withIndex) return;
    const els = REPORT_SECTIONS.map((_, i) => document.getElementById(sectionId(i))).filter(Boolean) as HTMLElement[];
    const visible = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const i = Number(e.target.id.replace("report-section-", ""));
          if (e.isIntersecting) visible.add(i);
          else visible.delete(i);
        }
        if (visible.size) setActive(Math.min(...visible));
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [withIndex]);

  const body = (
    <div className="space-y-4">
      {REPORT_SECTIONS.map((name, i) => (
        <section key={name} id={sectionId(i)} aria-labelledby={`${sectionId(i)}-h`} className={cn("break-inside-avoid scroll-mt-20 rounded-xl border bg-white p-5 transition-colors", withIndex && active === i ? "border-brand-500 ring-2 ring-brand-100" : "border-line")}>
          <h3 id={`${sectionId(i)}-h`} className="flex flex-wrap items-center gap-2 font-semibold">
            {i + 1}. {name}
          </h3>
          <ul className="mt-3 space-y-1.5">
            {evidence[name].map((l, j) => (
              <li key={j} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                <span className="text-muted">{l.label}</span>
                <span className="flex items-center gap-2 text-right">
                  <span className="font-medium">{l.value}</span>
                  <SourceBadge source={l.source} />
                </span>
              </li>
            ))}
          </ul>
          {onChange ? (
            <div className="mt-3">
              <label className="sr-only" htmlFor={`sec-${i}`}>
                PM notes for {name}
              </label>
              <Textarea id={`sec-${i}`} rows={3} placeholder="PM notes for this section (this user and period only)" value={sections[name] ?? ""} onChange={(e) => onChange({ ...sections, [name]: e.target.value })} />
            </div>
          ) : (
            sections[name] && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{sections[name]}</p>
          )}
          {sectionActions?.[name] && <div className="no-print mt-3 flex justify-end">{sectionActions[name]}</div>}
        </section>
      ))}
    </div>
  );

  if (!withIndex) return body;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_14rem]">
      {body}
      <nav aria-label="Report sections" className="no-print hidden lg:block">
        <ol className="sticky top-20 space-y-0.5 rounded-xl border border-line bg-white p-2 text-sm">
          {REPORT_SECTIONS.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                aria-current={active === i ? "true" : undefined}
                onClick={() => {
                  setActive(i);
                  document.getElementById(sectionId(i))?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn("w-full rounded-lg px-2.5 py-1.5 text-left", active === i ? "bg-brand-50 font-medium text-brand-700" : "text-muted hover:bg-slate-50 hover:text-ink")}
              >
                {i + 1}. {name}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
