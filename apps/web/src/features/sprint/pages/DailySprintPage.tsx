"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { useMe } from "@/features/shell";
import { assignmentsOf, courseById, courseProgress } from "@/features/learning";
import { carryForward, deleteTask, dsCell, saveTask, submitSprint, validateTask, weekIdFor } from "../api";
import { traineeOf } from "@/lib/mock/selectors";
import type { SprintTask } from "@/lib/mock/types";
import { MeetingBanner } from "../components/meeting-banner";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, ProgressBar, Select, StatCard, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDay, isWeekend, nowHHMM, todayISO, uid, weekStartOf } from "@/lib/utils";

const blank = (traineeUserId: string): SprintTask => ({ id: "", traineeUserId, title: "", description: "", category: "LND", plannedHours: 1, plannedStart: "", plannedEnd: "", actualHours: 0, blocker: "", done: false, date: todayISO() });

export default function DailySprintPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const today = todayISO();
  const [editing, setEditing] = useState<SprintTask | null>(null);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState<SprintTask | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [tab, setTab] = useState<"board" | "summary" | "history">("board");
  const [range, setRange] = useState({ from: addDays(today, -13), to: today });

  useEffect(() => {
    carryForward(user.id);
  }, [user.id]);

  const mine = db.sprintTasks.filter((t) => t.traineeUserId === user.id);
  const todayTasks = mine.filter((t) => t.date === today);
  const lastDay = [...new Set(mine.filter((t) => t.date < today).map((t) => t.date))].sort().pop();
  const yesterday = mine.filter((t) => t.date === lastDay && t.done);
  const submission = db.sprintSubmissions.find((s) => s.traineeUserId === user.id && s.date === today);
  const ws = weekStartOf(today);
  const weekTasks = mine.filter((t) => t.date >= ws && t.date <= addDays(ws, 6));
  const t = traineeOf(db, user.id)!;
  const plan = t.teamIds.map((tid) => dsCell(db, weekIdFor(tid, ws), user.id, ws, "PLAN")?.value).find(Boolean);
  const blockers = mine.filter((x) => x.blocker && x.date >= addDays(today, -7));
  const allSubmissions = db.sprintSubmissions.filter((s) => s.traineeUserId === user.id).sort((a, b) => b.date.localeCompare(a.date));
  const rangeOk = !!range.from && !!range.to && range.from <= range.to;
  const rangeDays = rangeOk ? Array.from({ length: Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86400000) + 1 }, (_, i) => addDays(range.from, i)).filter((d) => !isWeekend(d)) : [];
  const rangeDone = rangeOk ? mine.filter((x) => x.done && x.date >= range.from && x.date <= range.to) : [];
  const rangeSubs = rangeOk ? allSubmissions.filter((x) => x.date >= range.from && x.date <= range.to) : [];
  const cutoff = db.xpRules.sprintCutoff;

  const save = () => {
    if (!editing) return;
    const err = validateTask(editing);
    if (err) return setError(err);
    if (!editing.id && !editing.ownerId) return setError(`Choose which ${editing.category === "SBO" ? "SBU" : "L&D"} this task is for.`);
    const r = saveTask({ ...editing, id: editing.id || uid("st") });
    if (!r.ok) return setError(r.error);
    setEditing(null);
  };

  const submit = () => {
    const r = submitSprint(user.id);
    if (!r.ok) return setSubmitError(r.error);
    setSubmitError("");
    toast(r.data!.onTime ? "Sprint submitted on time. On-time XP is pending PM verification." : "Sprint recorded after the cutoff. Your streak is updated, but no on-time XP.", r.data!.onTime ? "success" : "info");
  };

  const toggle = (task: SprintTask) => saveTask({ ...task, done: !task.done, actualHours: !task.done && !task.actualHours ? task.plannedHours : task.actualHours });

  return (
    <div>
      <PageHeader
        title="Daily Sprint"
        description={`Submit once per day. On time when submitted at or before ${cutoff}. Incomplete tasks carry forward.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => { setError(""); setEditing(blank(user.id)); }}>
              <Plus className="h-4 w-4" /> Add task
            </Button>
            <Button onClick={submit} disabled={!!submission}>
              {submission ? "Submitted" : "Submit today's sprint"}
            </Button>
          </>
        }
      />
      <MeetingBanner db={db} userId={user.id} />
      <Tabs label="Daily sprint views" value={tab} onChange={setTab} tabs={[{ id: "board", label: "Board" }, { id: "summary", label: "Two-week summary" }, { id: "history", label: "History" }]} />

      {tab === "board" && (
        <>
          {submitError && (
            <div className="mb-4">
              <Alert tone="red">{submitError}</Alert>
            </div>
          )}
          {submission ? (
            <div className="mb-4">
              <Alert tone={submission.onTime ? "green" : "amber"}>
                Today&apos;s sprint is already recorded ({new Date(submission.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}, {submission.onTime ? "on time" : "after the cutoff"}).
              </Alert>
            </div>
          ) : (
            nowHHMM() > cutoff && (
              <div className="mb-4">
                <Alert tone="amber">It&apos;s past the {cutoff} cutoff. You can still submit — your streak updates, but no on-time XP is awarded.</Alert>
              </div>
            )
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Yesterday" description={lastDay ? `Completed work on ${formatDay(lastDay)}` : "No earlier sprint"}>
              {yesterday.length === 0 ? (
                <p className="text-sm text-muted">No completed tasks recorded.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {yesterday.map((x) => (
                    <li key={x.id} className="flex items-start justify-between gap-2">
                      <span>{x.title}</span>
                      <span className="text-xs text-muted">{x.actualHours}h</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="lg:col-span-2" title={`Today · ${formatDay(today)}`} description={`${todayTasks.filter((x) => x.done).length}/${todayTasks.length} done`}>
              {todayTasks.length === 0 ? (
                <EmptyState title="No tasks for today" description="Add your own sprint task before submitting" action={<Button onClick={() => setEditing(blank(user.id))}>Add task</Button>} />
              ) : (
                <ul className="divide-y divide-line">
                  {todayTasks.map((x) => (
                    <li key={x.id} className="flex items-start gap-3 py-3">
                      <input type="checkbox" checked={x.done} onChange={() => toggle(x)} className="mt-1 h-4 w-4 accent-brand-600" aria-label={`Mark ${x.title} done`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={x.done ? "text-muted line-through" : "font-medium"}>{x.title}</span>
                          <Badge tone={x.category === "SBO" ? "purple" : "blue"}>{x.category === "SBO" ? "SBU" : "L&D"}</Badge>
                          {x.ownerId && <Badge>{db.taskOwners.find((o) => o.id === x.ownerId)?.name}</Badge>}
                          {x.verification && <Badge tone={x.verification === "VERIFIED" ? "green" : x.verification === "NOT_CONFIRMED" ? "red" : "amber"}>{x.verification === "VERIFIED" ? "Approved" : x.verification === "NOT_CONFIRMED" ? "Declined" : "Awaiting approval"}</Badge>}
                          {x.carriedFrom && <Badge tone="amber">Carried forward</Badge>}
                        </div>
                        {x.description && <p className="text-sm text-muted">{x.description}</p>}
                        <p className="text-xs text-muted">
                          planned {x.plannedHours}h · actual {x.actualHours}h
                        </p>
                        {x.blocker && (
                          <p className="mt-1 flex items-center gap-1 text-xs text-red-700">
                            <AlertTriangle className="h-3 w-3" /> {x.blocker}
                          </p>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" aria-label={`Edit ${x.title}`} onClick={() => { setError(""); setEditing(x); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${x.title}`} onClick={() => setToDelete(x)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="This week target">
              <p className="text-sm">{plan ?? <span className="text-muted">No sprint plan set by your PM yet.</span>}</p>
              <p className="mt-3 text-xs text-muted">
                {weekTasks.reduce((s, x) => s + x.actualHours, 0)}h actual of {weekTasks.reduce((s, x) => s + x.plannedHours, 0)}h planned this week
              </p>
            </Card>
            <Card title="Linked course progress">
              <ul className="space-y-3">
                {assignmentsOf(db, user.id).map((a) => {
                  const p = courseProgress(db, user.id, a);
                  return (
                    <li key={a.id} className="text-sm">
                      {courseById(db, a.courseId)?.title} <span className="text-xs text-muted">{p.contentPct}%</span>
                      <ProgressBar value={p.contentPct} label="Course progress" />
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card title="Blockers (last 7 days)">
              {blockers.length === 0 ? (
                <p className="text-sm text-muted">No blockers reported.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {blockers.map((b) => (
                    <li key={b.id}>
                      <span className="font-medium">{b.blocker}</span>
                      <span className="block text-xs text-muted">
                        {b.title} · {formatDay(b.date)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "summary" && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="From" htmlFor="sf">
              <Input id="sf" type="date" className="w-44" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="st">
              <Input id="st" type="date" className="w-44" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </Field>
            <Button variant="secondary" onClick={() => setRange({ from: addDays(today, -13), to: today })}>
              Apply 14-day range
            </Button>
          </div>
          {!rangeOk ? (
            <Alert tone="amber">Choose a start date that is on or before the end date.</Alert>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Completed candidate tasks" value={rangeDone.length} hint={`Across ${rangeDays.length} working days`} icon={<CheckCircle2 className="h-5 w-5" />} />
              <StatCard label="Sprint submissions" value={`${rangeSubs.length} / ${rangeDays.length}`} hint={`${rangeSubs.filter((x) => !x.onTime).length} submitted after the cutoff`} icon={<ClipboardCheck className="h-5 w-5" />} />
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <Card title="History" description="Your past sprint submissions and the tasks you completed each day.">
          {allSubmissions.length === 0 ? (
            <EmptyState title="No submissions yet" description="Submitted sprints appear here." />
          ) : (
            <Table head={["Date", "Submitted", "Status", "Tasks completed", "Hours logged"]}>
              {allSubmissions.map((s) => {
                const day = mine.filter((x) => x.date === s.date);
                return (
                  <tr key={s.date}>
                    <Td>{formatDay(s.date)}</Td>
                    <Td>{new Date(s.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</Td>
                    <Td>
                      <StatusBadge status={s.onTime ? "On time" : "Late"} />
                    </Td>
                    <Td>
                      {day.filter((x) => x.done).length}/{day.length}
                      {day.length > 0 && <span className="block max-w-md truncate text-xs text-muted">{day.map((x) => (x.ownerId ? `${x.title} (${db.taskOwners.find((o) => o.id === x.ownerId)?.name})` : x.title)).join(" · ")}</span>}
                    </Td>
                    <Td>{day.reduce((sum, x) => sum + x.actualHours, 0)}h</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      )}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit task" : "Add sprint task"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save task</Button>
          </>
        }
      >
        {editing && (
          <>
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <Field label="Title" htmlFor="tt" required>
              <Input id="tt" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Description" htmlFor="td">
              <Textarea id="td" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" htmlFor="tc">
                <Select id="tc" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as SprintTask["category"], ownerId: undefined })}>
                  <option value="LND">L&amp;D</option>
                  <option value="SBO">SBU</option>
                </Select>
              </Field>
              <Field label={editing.category === "SBO" ? "Which SBU?" : "Which L&D?"} htmlFor="to" required={!editing.id} hint="They are emailed to verify this task.">
                <Select id="to" value={editing.ownerId ?? ""} onChange={(e) => setEditing({ ...editing, ownerId: e.target.value || undefined })}>
                  <option value="">Choose…</option>
                  {db.taskOwners
                    .filter((o) => o.kind === editing.category)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Planned hours" htmlFor="tph">
                <Input id="tph" type="number" min={0} step={0.5} value={editing.plannedHours} onChange={(e) => setEditing({ ...editing, plannedHours: Number(e.target.value) })} />
              </Field>
              <Field label="Actual hours" htmlFor="tah">
                <Input id="tah" type="number" min={0} step={0.5} value={editing.actualHours} onChange={(e) => setEditing({ ...editing, actualHours: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Blocker" htmlFor="tb" hint="Leave empty if nothing blocks you">
              <Input id="tb" value={editing.blocker} onChange={(e) => setEditing({ ...editing, blocker: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>
      <ConfirmDialog open={!!toDelete} danger title="Delete task?" message={toDelete ? `Delete "${toDelete.title}" from today's sprint? This cannot be undone.` : ""} confirmLabel="Delete task" onConfirm={() => toDelete && deleteTask(toDelete.id)} onClose={() => setToDelete(null)} />
    </div>
  );
}
