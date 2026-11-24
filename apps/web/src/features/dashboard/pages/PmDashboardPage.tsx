"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Activity, Lightbulb, Clock, UserCheck, UserCog, UserPlus, UserX, Users } from "lucide-react";
import { useMe } from "@/features/shell";
import { pmDashboard, SECTOR_COLOR, SECTOR_LABEL } from "../selectors";
import { TraineeFormDialog, AddPMDialog } from "@/features/directory";
import { SectorGrowth } from "../components/sector-growth";
import { Avatar, Button, Card, ProgressBar, StatCard } from "@/components/ui/ui";
import { useToast } from "@/components/ui/toast";
import { cn, parseISODate } from "@/lib/utils";

const TONES = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-brand-50 text-brand-700",
  purple: "bg-violet-50 text-violet-700",
} as const;

function Tile({ label, value, tone, hint }: { label: string; value: ReactNode; tone: keyof typeof TONES; hint?: string }) {
  return (
    <div className={cn("rounded-lg px-3 py-2.5", TONES[tone])}>
      <p className="text-2xl font-semibold leading-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs font-medium">{label}</p>
      {hint && <p className="text-[11px] opacity-80">{hint}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line pt-5 first:border-t-0 first:pt-0 [&:not(:first-child)]:mt-5">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

/** Stacked bar that never renders an empty segment. */
function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <>
      <div role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")} className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {total > 0 && parts.filter((p) => p.value > 0).map((p) => <div key={p.label} style={{ flex: p.value, background: p.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.label} · {p.value}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function PMDashboard() {
  const { db, user } = useMe();
  const toast = useToast();
  const [pmOpen, setPmOpen] = useState(0);
  const [userOpen, setUserOpen] = useState(0);
  const d = pmDashboard(db, user.id);
  const a = d.attendance;
  const hour = new Date().getHours();
  const maxSector = Math.max(1, ...d.sectorCounts.map((s) => s.count));
  const courseTotal = d.courses.active + d.courses.completed;
  const coursePct = courseTotal ? Math.round((d.courses.completed / courseTotal) * 100) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted">{parseISODate(d.today).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setUserOpen(userOpen + 1)}>
            <UserPlus className="h-4 w-4" aria-hidden /> Add Users
          </Button>
          <Button variant="secondary" onClick={() => setPmOpen(pmOpen + 1)}>
            <UserCog className="h-4 w-4" aria-hidden /> Add PM
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Users" value={d.total} hint={`${d.active} active · ${d.inactive} inactive`} icon={<Users className="h-5 w-5" />} href="/pm/users" />
        <StatCard label="Active Users" value={d.active} hint="Currently in training" icon={<UserCheck className="h-5 w-5" />} href="/pm/users" />
        <StatCard label="Inactive Users" value={d.inactive} hint="Period ended · archived" icon={<UserX className="h-5 w-5" />} href="/pm/archive" />
        <StatCard
          label="Attendance Rate"
          value={a.rate == null ? "—" : `${a.rate}%`}
          hint={d.isHoliday ? "Weekend / holiday today" : `Today · ${a.present + a.late} checked in`}
          icon={<Activity className="h-5 w-5" />}
          href="/pm/attendance"
        />
        <StatCard label="Suggested Courses" value={d.suggested} hint="Awaiting your approval" icon={<Lightbulb className="h-5 w-5" />} href="/pm/courses" />
        <StatCard label="Pending Requested Courses" value={d.pendingRequests} hint="Requested by users" icon={<Clock className="h-5 w-5" />} href="/pm/courses" />
      </div>

      <div className="mt-6">
        <SectorGrowth months={d.growth.months} rows={d.growth.rows} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Skill Analysis Summary" description={`${d.active} active users across ${d.sectorCounts.length} sectors`}>
          <Section title="Sector distribution">
            <ul className="space-y-3">
              {d.sectorCounts.map((s) => (
                <li key={s.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <i className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-semibold tabular-nums">{s.count}</span>
                  </div>
                  <div role="progressbar" aria-label={`${s.label} users`} aria-valuenow={s.count} aria-valuemin={0} aria-valuemax={d.active} className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / maxSector) * 100}%`, background: s.color }} />
                  </div>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Top performers · assessment marks">
            {d.topPerformers.length === 0 ? (
              <p className="text-sm text-muted">No assessment results yet.</p>
            ) : (
              <ol className="space-y-2">
                {d.topPerformers.map((p, i) => (
                  <li key={p.userId}>
                    <Link href={`/pm/trainees/${p.userId}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 hover:bg-slate-50">
                      <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", i === 0 ? "bg-amber-100 text-amber-800" : i === 1 ? "bg-slate-200 text-slate-700" : "bg-orange-100 text-orange-800")} aria-label={`Rank ${i + 1}`}>
                        {i + 1}
                      </span>
                      <Avatar name={p.name} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          <i className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLOR[p.sector] }} />
                          {SECTOR_LABEL[p.sector]}
                        </span>
                      </span>
                      <span className="text-right tabular-nums">
                        <b className="text-base">{p.marks}</b> <span className="text-xs text-muted">/ {p.total}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </Card>

        <Card title="Course Analysis Summary" description="Courses, exams and daily sprint">
          <Section title="Course completion">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Active courses" value={d.courses.active} tone="blue" />
              <Tile label="Completed courses" value={d.courses.completed} tone="green" />
            </div>
            <div className="mt-3">
              <ProgressBar value={coursePct} tone="green" label="Completed courses" />
              <p className="mt-2 text-xs text-muted">
                {coursePct}% of {courseTotal} course assignments completed
              </p>
            </div>
          </Section>
          <Section title="Exam / assessment progress">
            <div className="grid grid-cols-3 gap-3">
              <Tile label="Submitted" value={d.exams.submitted} tone="green" />
              <Tile label="In progress" value={d.exams.inProgress} tone="blue" />
              <Tile label="Overdue" value={d.exams.overdue} tone="red" />
            </div>
          </Section>
          <Section title="Daily sprint progress · today">
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Completed" value={d.sprint.done} tone="green" hint={d.sprint.eligible ? `${Math.round((d.sprint.done / d.sprint.eligible) * 100)}% of users` : undefined} />
              <Tile label="Not completed" value={d.sprint.notDone} tone="amber" hint={d.sprint.eligible ? `${Math.round((d.sprint.notDone / d.sprint.eligible) * 100)}% of users` : undefined} />
            </div>
            <div className="mt-3">
              <Split
                parts={[
                  { label: "Completed", value: d.sprint.done, color: "#10b981" },
                  { label: "Not completed", value: d.sprint.notDone, color: "#f59e0b" },
                ]}
              />
              {d.isHoliday && <p className="mt-2 text-xs text-muted">Weekend / holiday: no sprint is expected today.</p>}
            </div>
          </Section>
        </Card>

        <Card title="Operations Summary" description={`Today's attendance · ${parseISODate(d.today).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`}>
          <Section title="Today's attendance">
            <div className="mb-3 flex items-baseline justify-between text-sm">
              <span>Attendance rate</span>
              <b className="text-lg tabular-nums">{a.rate == null ? "—" : `${a.rate}%`}</b>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tile label="Present" value={a.present} tone="green" />
              <Tile label="Late" value={a.late} tone="amber" />
              <Tile label="Absent" value={a.absent} tone="red" hint="Marked absent" />
              <Tile label="On leave" value={a.leave} tone="purple" hint="Approved leave" />
            </div>
            <div className="mt-3">
              <Split
                parts={[
                  { label: "Present", value: a.present, color: "#10b981" },
                  { label: "Late", value: a.late, color: "#f59e0b" },
                  { label: "Absent", value: a.absent, color: "#ef4444" },
                  { label: "On leave", value: a.leave, color: "#8b5cf6" },
                ]}
              />
            </div>
            {d.isHoliday ? (
              <p className="mt-3 text-xs text-muted">Weekend / holiday: no attendance is expected today.</p>
            ) : (
              a.noData > 0 && <p className="mt-3 text-xs text-muted">{a.noData} user(s) have no ERP record yet today. A missing record is not counted as absence.</p>
            )}
          </Section>
        </Card>
      </div>

      {userOpen > 0 && <TraineeFormDialog key={userOpen} db={db} pmId={user.id} open onClose={() => setUserOpen(0)} onSaved={(m) => toast(m)} />}
      {pmOpen > 0 && <AddPMDialog key={pmOpen} creatorId={user.id} open onClose={() => setPmOpen(0)} onSaved={(m) => toast(m)} />}
    </div>
  );
}
