"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Pencil, Plus, Search } from "lucide-react";
import { useMe } from "@/features/shell";
import { assignmentsOf, courseById, overallProgress } from "@/features/learning";
import { createTeam } from "../mock-api";
import { nameOf, pmTrainees } from "@/lib/mock/selectors";
import { skillsOf } from "@/features/assessment";
import { streakOf, xpTotal } from "@/features/gamification-core";
import { TECHNOLOGIES } from "@/lib/mock/content";
import { TraineeFormDialog } from "../components/trainee-form";
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Pagination, ProgressBar, Select, Table, Tabs, Td } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, POSITION_LABEL, RESOURCE_LABEL, tenureLabel, todayISO } from "@/lib/utils";

const PAGE = 5;

export default function AllUsersPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const [tab, setTab] = useState<"trainees" | "teams">("trainees");
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("");
  const [resource, setResource] = useState("");
  const [skill, setSkill] = useState("");
  const [asOf, setAsOf] = useState(addDays(todayISO(), -1));
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; id?: string; key: number }>({ open: false, key: 0 });
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamError, setTeamError] = useState("");

  const today = todayISO();
  const all = pmTrainees(db, user.id);
  const filtered = all.filter((t) => {
    const name = nameOf(db, t.userId);
    return (!pos || t.position === pos) && (!resource || t.resource === resource) && (!skill || skillsOf(db, t.userId).skills.includes(skill)) && (!q || `${name} ${t.traineeId}`.toLowerCase().includes(q.toLowerCase()));
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const myTeams = db.teams.filter((t) => t.pmId === user.id);

  const attendanceAsOf = (uid: string, physical: boolean) => {
    if (!physical) return <Badge tone="gray">Online</Badge>;
    const r = db.attendance.find((a) => a.traineeUserId === uid && a.date === asOf);
    if (!r) return <Badge tone="gray">Unavailable</Badge>;
    return <Badge tone={r.lateMinutes ? "amber" : "green"}>{r.lateMinutes ? `Late ${r.lateMinutes}m` : `In ${r.entry}`}</Badge>;
  };

  /** Every trainee in scope (ignores the filters) as one XLSX file. */
  const exportAll = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const head = ["Name", "User ID", "Email", "Position", "Resources", "Skills", "Teams", "Onboarding date", "Departure date", "Tenure", "Progress %", "Mastery %", "XP", "Streak (days)"].map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#e8eefc" }));
    const body = all.map((t) => {
      const u = db.users.find((x) => x.id === t.userId)!;
      const p = overallProgress(db, t.userId);
      return [
        { value: u.name },
        { value: t.traineeId },
        { value: u.email },
        { value: POSITION_LABEL[t.position] },
        { value: RESOURCE_LABEL[t.resource] },
        { value: skillsOf(db, t.userId).skills.join(", ") },
        { value: t.teamIds.map((id) => db.teams.find((x) => x.id === id)?.name).filter(Boolean).join(", ") },
        { value: formatDate(t.onboardDate) },
        { value: t.periodEnd ? formatDate(t.periodEnd) : "Not set" },
        { value: tenureLabel(t.onboardDate) },
        { value: p.contentPct },
        { value: p.masteryPct },
        { value: xpTotal(db, t.userId) },
        { value: streakOf(db, t.userId) },
      ];
    });
    const columns = [24, 12, 30, 14, 14, 30, 20, 16, 16, 14, 11, 11, 8, 13].map((width) => ({ width }));
    await writeXlsxFile([head, ...body], { columns, sheet: "All users" }).toFile(`all_users_${todayISO()}.xlsx`);
    toast("Exported all user info.");
  };

  return (
    <div>
      <PageHeader
        title="All Users"
        description="Active users in your scope. Users whose training period ends move to the Archive."
        actions={
          tab === "trainees" ? (
            <Button onClick={exportAll}>
              <Download className="h-4 w-4" /> Export all user info
            </Button>
          ) : (
            <Button onClick={() => { setTeamError(""); setTeamOpen(true); }}>
              <Plus className="h-4 w-4" /> Create team
            </Button>
          )
        }
      />
      <Tabs label="Directory" value={tab} onChange={setTab} tabs={[{ id: "trainees", label: `Users (${all.length})` }, { id: "teams", label: `Teams (${myTeams.length})` }]} />

      {tab === "trainees" && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search by ID or name" placeholder="Search by ID or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select aria-label="Position" value={pos} onChange={(e) => { setPos(e.target.value); setPage(1); }}>
              <option value="">All positions</option>
              {Object.entries(POSITION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select aria-label="Resources" value={resource} onChange={(e) => { setResource(e.target.value); setPage(1); }}>
              <option value="">All resources</option>
              {Object.entries(RESOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select aria-label="Skill" value={skill} onChange={(e) => { setSkill(e.target.value); setPage(1); }}>
              <option value="">All skills</option>
              {TECHNOLOGIES.filter((t) => t !== "Other").map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </div>
          <div className="mb-3 flex items-center gap-2 text-sm">
            <label htmlFor="asof" className="text-muted">
              Attendance as of
            </label>
            <Input id="asof" type="date" value={asOf} max={today} onChange={(e) => setAsOf(e.target.value)} className="w-44" />
          </div>
          {rows.length === 0 ? (
            <EmptyState title="No users match these filters." />
          ) : (
            <Table head={["Users", "Position", "Skills", "Resources", "Assigned course", "Progress", "Onboarded", "Departure date", "Tenure", "Attendance", "Last 2 weeks", "Latest feedback", ""]}>
              {rows.map((t) => {
                const u = db.users.find((x) => x.id === t.userId)!;
                const as = assignmentsOf(db, t.userId);
                const sk = skillsOf(db, t.userId);
                const p = overallProgress(db, t.userId);
                const twoWeeks = db.sprintTasks.filter((x) => x.traineeUserId === t.userId && x.date >= addDays(today, -14) && x.date < today);
                const subs = db.sprintSubmissions.filter((x) => x.traineeUserId === t.userId && x.date >= addDays(today, -14));
                const fb = db.feedback.filter((f) => f.traineeUserId === t.userId).sort((a, b) => b.version - a.version)[0];
                return (
                  <tr key={t.userId}>
                    <Td>
                      <Link href={`/pm/trainees/${t.userId}`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                        <Avatar name={u.name} src={u.photoUrl} size={28} />
                        <span>
                          {u.name}
                          <span className="block text-xs font-normal text-muted">{t.traineeId}</span>
                        </span>
                      </Link>
                    </Td>
                    <Td>{POSITION_LABEL[t.position]}</Td>
                    <Td className="max-w-48">
                      {sk.taken ? (
                        <span className="line-clamp-2 text-xs" title={sk.skills.join(", ")}>
                          {sk.skills.length ? sk.skills.join(", ") : "None yet"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Assessment pending</span>
                      )}
                    </Td>
                    <Td>{RESOURCE_LABEL[t.resource]}</Td>
                    <Td className="max-w-44">
                      {as.length ? (
                        <span className="block truncate">{as.map((a) => courseById(db, a.courseId)?.title).join(", ")}</span>
                      ) : (
                        <span className="text-muted">None</span>
                      )}
                    </Td>
                    <Td className="w-32">
                      <span className="text-xs text-muted">
                        {p.contentPct}% · mastery {p.masteryPct}%
                      </span>
                      <ProgressBar value={p.contentPct} label="Progress" />
                    </Td>
                    <Td>{formatDate(t.onboardDate)}</Td>
                    <Td>{t.periodEnd ? formatDate(t.periodEnd) : <span className="text-muted">Not set</span>}</Td>
                    <Td>{tenureLabel(t.onboardDate)}</Td>
                    <Td>{attendanceAsOf(t.userId, t.attendanceMode === "PHYSICAL")}</Td>
                    <Td className="text-xs">
                      {twoWeeks.filter((x) => x.done).length}/{twoWeeks.length} tasks done
                      <span className="block text-muted">{subs.length} sprint submissions</span>
                    </Td>
                    <Td className="max-w-52">
                      <span className="line-clamp-2 text-xs text-muted">{fb?.text ?? "—"}</span>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${u.name}`} onClick={() => setForm({ open: true, id: t.userId, key: form.key + 1 })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          <Pagination page={current} pages={pages} onChange={setPage} />
        </>
      )}

      {tab === "teams" && (
        <div className="grid gap-4 md:grid-cols-2">
          {myTeams.map((tm) => {
            const members = all.filter((t) => t.teamIds.includes(tm.id));
            return (
              <Card key={tm.id} title={tm.name} description={`PM: ${nameOf(db, tm.pmId)} · ${members.length} user(s)`}>
                {members.length === 0 ? (
                  <p className="text-sm text-muted">No users yet. Add them from the Users tab.</p>
                ) : (
                  <ul className="space-y-2">
                    {members.map((m) => (
                      <li key={m.userId} className="flex items-center justify-between text-sm">
                        <Link href={`/pm/trainees/${m.userId}`} className="hover:text-brand-700">
                          {nameOf(db, m.userId)} <span className="text-muted">({m.traineeId})</span>
                        </Link>
                        <span className="text-xs text-muted">{POSITION_LABEL[m.position]}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {form.open && <TraineeFormDialog key={form.key} db={db} editUserId={form.id} open onClose={() => setForm({ ...form, open: false })} onSaved={(m) => toast(m)} />}

      <Dialog
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        title="Create team"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTeamOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = createTeam(user.id, teamName);
                if (!r.ok) return setTeamError(r.error);
                setTeamOpen(false);
                setTeamName("");
                toast("Team created. You are its PM.");
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <Field label="Team name" htmlFor="tmn" required error={teamError} hint="A team has exactly one PM at a time.">
          <Input id="tmn" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Delta" />
        </Field>
      </Dialog>
    </div>
  );
}
