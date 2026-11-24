"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Award, BookOpen, CalendarCheck, ClipboardCheck, Info, Play } from "lucide-react";
import { useMe } from "@/components/layout/hooks";
import { traineeOf } from "@/lib/api";
import { traineeDashboard } from "@/lib/dashboard";
import { Badge, EmptyState } from "@/components/ui/ui";
import { MeetingBanner } from "@/components/domain/meeting-banner";
import { cn, parseISODate, RESOURCE_LABEL, todayISO } from "@/lib/utils";

/* Tinted tiles are used on this dashboard only. */
const TILE = {
  ink: "border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 [&_.v]:text-ink",
  blue: "border-brand-100 bg-gradient-to-br from-brand-50 to-[#e3eeff] [&_.v]:text-brand-600",
  green: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-[#dcf5e8] [&_.v]:text-emerald-600",
  orange: "border-orange-200 bg-gradient-to-br from-orange-50 to-[#ffeed8] [&_.v]:text-amber-600",
  red: "border-red-200 bg-gradient-to-br from-red-50 to-[#ffe2e2] [&_.v]:text-red-600",
} as const;

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone: keyof typeof TILE }) {
  return (
    <div className={cn("rounded-xl border px-3.5 py-3", TILE[tone])}>
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <p className="v mt-0.5 text-3xl font-semibold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

function Panel({ title, subtitle, icon, tag, children, className }: { title: string; subtitle: string; icon: ReactNode; tag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-line bg-gradient-to-b from-white to-slate-50/60 p-5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(31,91,214,.12)]", className)}>
      <div className="mb-4 flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold leading-tight">{title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
        </div>
        {tag && <span className="ml-auto whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{tag}</span>}
      </div>
      {children}
    </section>
  );
}

function Bar({ value, label, thin }: { value: number; label: string; thin?: boolean }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} className={cn("w-full overflow-hidden rounded-full bg-[#e8eef8]", thin ? "h-2" : "h-2.5")}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-600 to-[#4f8bff] transition-[width] duration-700" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function Legend({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
          {i.label} <b className="tabular-nums">{i.value}</b>
        </li>
      ))}
    </ul>
  );
}

function Donut({ segments, label, center }: { segments: { value: number; color: string }[]; label: string; center: string }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div role="img" aria-label={label} className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#e8eef8" strokeWidth="14" />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * C;
              const el = <circle key={s.color} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
              offset += len;
              return el;
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <b className="text-3xl font-bold leading-tight">{center}</b>
        <span className="text-[13px] text-muted">Attendance</span>
      </div>
    </div>
  );
}

export default function TraineeDashboard() {
  const { db, user } = useMe();
  const today = todayISO();
  const d = traineeDashboard(db, user.id);
  const profile = traineeOf(db, user.id);
  const { courses: c, assessments: s, attendance: a, current } = d;
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rate = a.rate == null ? "—" : `${a.rate}%`;
  const attPct = s.total ? Math.round((s.completed / s.total) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {greet}, {user.name.split(" ")[0]}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted">{parseISODate(today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          {profile && <Badge tone="blue">{RESOURCE_LABEL[profile.resource]}</Badge>}
        </div>
      </div>
      <MeetingBanner db={db} userId={user.id} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Courses & Learning Progress" subtitle="From your learning roadmap" icon={<BookOpen className="h-5 w-5" />} tag={c.total ? `${c.overall}% overall` : undefined}>
          {c.total === 0 ? (
            <EmptyState title="No courses assigned yet" description="Your PM assigns courses after reviewing your skill analysis. You can also request a course from the roadmap." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Tile label="Total Courses" value={c.total} tone="ink" />
                <Tile label="Completed" value={c.completed} tone="green" />
                <Tile label="In Progress" value={c.inProgress} tone="blue" />
                <Tile label="Upcoming" value={c.upcoming} tone="orange" />
              </div>
              <div className="mb-2 mt-5 flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold">Overall Learning Progress</h3>
                <span className="text-[13px] text-muted">
                  <b className="text-[15px] text-ink">{c.overall}%</b> average across {c.total} courses
                </span>
              </div>
              <Bar value={c.overall} label="Overall learning progress" />
              <Legend
                items={[
                  { label: "Completed", value: c.completed, color: "#22c55e" },
                  { label: "In Progress", value: c.inProgress, color: "#2f6fed" },
                  { label: "Upcoming", value: c.upcoming, color: "#f59e0b" },
                ]}
              />
              {current && (
                <div className="mt-5 grid gap-3 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50 to-[#e9f1ff] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Current active course</p>
                    <h4 className="mt-0.5 truncate text-[17px] font-semibold">{current.title}</h4>
                    <p className="mb-2.5 mt-0.5 text-[13px] text-muted">{current.nextUp ? `Next up: ${current.nextUp}` : "Pick up where you left off"}</p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Bar value={current.pct} label={`${current.title} progress`} thin />
                      </div>
                      <b className="text-[13px] tabular-nums">{current.pct}%</b>
                    </div>
                  </div>
                  <Link href={current.href} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700">
                    <Play className="h-4 w-4" aria-hidden /> Continue Learning
                  </Link>
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Assessments" subtitle="Your assessment performance" icon={<ClipboardCheck className="h-5 w-5" />}>
          {s.total === 0 ? (
            <EmptyState title="No assessments yet" description="Assessments appear once courses are assigned to you." />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Tile label="Total Assessments" value={s.total} tone="ink" />
                <Tile label="Completed" value={s.completed} tone="green" />
                <Tile label="Upcoming" value={s.upcoming} tone="orange" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Tile label="Attempts" value={s.attempts} tone="blue" />
                <Tile label="Average Score" value={s.average == null ? "—" : `${s.average}%`} tone="green" />
              </div>
              <div className="mb-2 mt-5 flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold">Assessment Progress</h3>
                <span className="text-[13px] text-muted">
                  <b className="text-[15px] text-ink">{attPct}%</b> attempted
                </span>
              </div>
              <Bar value={attPct} label="Assessment progress" />
              <Legend
                items={[
                  { label: "Completed", value: s.completed, color: "#22c55e" },
                  { label: "Upcoming", value: s.upcoming, color: "#f59e0b" },
                ]}
              />
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-line bg-white px-4 py-3 text-sm">
                <Award className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                <span className="min-w-0">
                  {s.next ? (
                    <>
                      Next:{" "}
                      <Link href={s.next.href} className="font-semibold hover:text-brand-700">
                        {s.next.title}
                      </Link>
                    </>
                  ) : (
                    "All assessments attempted"
                  )}
                </span>
              </div>
              <p className="mt-2.5 text-xs text-muted">Upcoming = assessments you haven&apos;t attempted yet. Average Score covers every scored attempt, including provisional results.</p>
            </>
          )}
        </Panel>
      </div>

      <Panel className="mt-6" title="Attendance Overview" subtitle={a.month} icon={<CalendarCheck className="h-5 w-5" />}>
        {a.present + a.late + a.leave === 0 ? (
          <EmptyState title="No attendance data for this month yet" description="ERP attendance is synced after each working day. A missing record is never counted as absence." />
        ) : (
          <div className="grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto]">
            <Donut
              label={`Attendance ${rate}: ${a.present} present, ${a.late} late, ${a.absent} absent, ${a.leave} on approved leave`}
              center={rate}
              segments={[
                { value: a.present, color: "#22c55e" },
                { value: a.late, color: "#f59e0b" },
                { value: a.absent, color: "#ef4444" },
                { value: a.leave, color: "#3b82f6" },
              ]}
            />
            <div>
              <ul className="max-w-md text-[15px]">
                {[
                  ["Present", a.present, "#22c55e"],
                  ["Late", a.late, "#f59e0b"],
                  ["Absent", a.absent, "#ef4444"],
                  ["Approved Leave", a.leave, "#3b82f6"],
                ].map(([label, v, color]) => (
                  <li key={label as string} className="flex items-center gap-2.5 py-1.5">
                    <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color as string }} />
                    {label}
                    {label === "Absent" && (
                      <span title="A missing ERP record is not counted as absence." className="inline-flex cursor-help text-slate-400" role="img" aria-label="A missing ERP record is not counted as absence.">
                        <Info className="h-4 w-4" />
                      </span>
                    )}
                    <span className="ml-auto font-semibold tabular-nums">{v}</span>
                  </li>
                ))}
                <li className="mt-2 flex justify-between border-t border-line pt-2.5">
                  Total Working Days <span className="font-semibold tabular-nums">{a.workdays}</span>
                </li>
                <li className="flex justify-between py-1.5">
                  Attendance <span className="font-semibold tabular-nums text-emerald-600">{rate}</span>
                </li>
              </ul>
              <p className="mt-2 text-xs text-muted">Absent is always 0: a missing ERP record is never counted as absence.</p>
              {a.noDataDays.length > 0 && (
                <p className="mt-1 text-xs text-muted">
                  No ERP data yet (not counted): {a.noDataDays.map((d) => parseISODate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })).join(", ")}. Send a reconciliation request if this is wrong.
                </p>
              )}
            </div>
            <div className="md:border-l md:border-line md:pl-6">
              <Link href="/trainee/erp?tab=erp" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-4 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50">
                <CalendarCheck className="h-4 w-4" aria-hidden /> View Attendance History
              </Link>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
