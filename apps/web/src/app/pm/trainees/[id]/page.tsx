"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Pencil, ShieldAlert } from "lucide-react";
import { useMe } from "@/components/layout/hooks";
import { assignmentsOf, attemptPercent, courseById, courseProgress, evaluationsOf, finaliseAttempt, inScope, levelFor, nameOf, retryEmail, saveFeedback, streakOf, traineeOf, verifyTaskOwner, xpTotal } from "@/lib/api";
import { Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, Field, Input, KeyValue, ProgressBar, Select, StatCard, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { SkillReport } from "@/components/domain/skill-report";
import { OfficeAttendanceTable, MeetingAttendanceTable } from "@/components/domain/attendance";
import { TraineeFormDialog } from "@/components/domain/trainee-form";
import { BackLink } from "@/components/domain/learning";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, formatDateTime, formatDay, isWeekend, MODE_LABEL, POSITION_LABEL, RESOURCE_LABEL, tenureLabel, todayISO } from "@/lib/utils";

const SUBMIT_REASON = { SUBMITTED: "Submitted by the user", TIME_UP: "Time up — auto-submitted", TAB_HIDDEN: "Tab hidden — auto-submitted", OFFLINE: "Offline — pending" } as const;

type Part = "personal" | "skills" | "learning" | "sprint" | "attendance" | "feedback";

export default function TraineeProfilePM() {
  const { id } = useParams<{ id: string }>();
  const { db, user } = useMe();
  const toast = useToast();
  const [part, setPart] = useState<Part>("personal");
  const [evId, setEvId] = useState("");
  const [edit, setEdit] = useState(0);
  const [fbText, setFbText] = useState<string | null>(null);
  const [fin, setFin] = useState<{ id: string; score: number; mastered: boolean } | null>(null);
  const [finError, setFinError] = useState("");

  if (!inScope(db, user.id, id)) return <EmptyState title="This user is not in your scope" description="Links to users managed by another PM are ignored." action={<Link href="/pm/users" className="text-sm font-medium text-brand-600">Back to All Users</Link>} />;

  const t = traineeOf(db, id)!;
  const u = db.users.find((x) => x.id === id)!;
  // Archived users are shown as of the end of their trainee period, so the recent-work windows hold their last records.
  const today = t.archivedAt ? t.periodEnd : todayISO();
  const evs = evaluationsOf(db, id);
  const ev = evs.find((e) => e.id === evId) ?? evs[0];
  const as = assignmentsOf(db, id);
  const attempts = db.attempts.filter((a) => a.traineeUserId === id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const tasks = db.sprintTasks.filter((x) => x.traineeUserId === id && x.date >= addDays(today, -14)).sort((a, b) => b.date.localeCompare(a.date));
  const feedback = db.feedback.filter((f) => f.traineeUserId === id).sort((a, b) => b.version - a.version);
  const badges = db.badgeAwards.filter((b) => b.traineeUserId === id);
  const xp = xpTotal(db, id);
  const fbValue = fbText ?? feedback[0]?.text ?? "";
  const twoFrom = addDays(today, -13);
  const twoDays = Array.from({ length: 14 }, (_, i) => addDays(twoFrom, i)).filter((d) => !isWeekend(d) && d >= t.onboardDate);
  const twoDone = db.sprintTasks.filter((x) => x.traineeUserId === id && x.done && x.date >= twoFrom && x.date <= today).length;
  const twoSubs = db.sprintSubmissions.filter((x) => x.traineeUserId === id && x.date >= twoFrom && x.date <= today);

  return (
    <div>
      <BackLink href={t.archivedAt ? "/pm/archive" : "/pm/users"} label={t.archivedAt ? "Archive" : "All Users"} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={u.name} src={u.photoUrl} size={56} />
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              {u.name}
              {t.archivedAt && <Badge tone="gray">Inactive · archived</Badge>}
            </h1>
            <p className="text-sm text-muted">
              {t.traineeId} · {POSITION_LABEL[t.position]} · {RESOURCE_LABEL[t.resource]} · {t.archivedAt ? `Period ended ${formatDate(t.periodEnd)}` : tenureLabel(t.onboardDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700" href={`/pm/reports?trainee=${id}`}>
            Report
          </Link>
        </div>
      </div>

      <Tabs
        label="User profile sections"
        value={part}
        onChange={setPart}
        tabs={[
          { id: "personal", label: "Personal information" },
          { id: "skills", label: "Skills analysis" },
          { id: "learning", label: "Learning & course results" },
          { id: "sprint", label: "Sprint & recent work" },
          { id: "attendance", label: "Attendance" },
          { id: "feedback", label: "Feedback & recognition" },
        ]}
      />

      {part === "personal" && (
        <Card title="Personal information" action={<Button size="sm" variant="secondary" onClick={() => setEdit(edit + 1)}><Pencil className="h-4 w-4" /> Edit</Button>}>
          <KeyValue
            items={[
              ["Full name", u.name],
              ["User ID", t.traineeId],
              ["Email", u.email],
              ["Position", POSITION_LABEL[t.position]],
              ["Resources", RESOURCE_LABEL[t.resource]],
              ["Attendance mode", MODE_LABEL[t.attendanceMode]],
              ["Onboarding date", t.archivedAt ? formatDate(t.onboardDate) : `${formatDate(t.onboardDate)} (${tenureLabel(t.onboardDate)})`],
              ["Departure date", t.periodEnd ? formatDate(t.periodEnd) : "Not set (reactivated)"],
              ["Team", t.teamIds.map((x) => db.teams.find((tm) => tm.id === x)?.name).join(", ")],
              ["Account status", t.archivedAt ? `Inactive — archived ${formatDate(t.archivedAt)}` : u.mustChangePassword ? "Temporary password — not changed yet" : "Active"],
              ["Bio / learning goals", u.bio || "—"],
            ]}
          />
        </Card>
      )}

      {part === "skills" &&
        (ev ? (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <label htmlFor="evv" className="text-sm text-muted">
                Version
              </label>
              <Select id="evv" className="w-72" value={ev.id} onChange={(e) => setEvId(e.target.value)}>
                {evs.map((e) => (
                  <option key={e.id} value={e.id}>
                    v{e.version} · {formatDateTime(e.createdAt)}
                  </option>
                ))}
              </Select>
            </div>
            <SkillReport db={db} ev={ev} />
          </div>
        ) : (
          <EmptyState title="No skill analysis yet" description="The user hasn't completed the initial skill assessment. You can still assign any course from Learning Roadmap → All courses." />
        ))}

      {part === "learning" && (
        <div className="space-y-6">
          <Card title="Assigned courses">
            {as.length === 0 ? (
              <p className="text-sm text-muted">No courses assigned.</p>
            ) : (
              <Table head={["Course", "Version", "Assigned", "Due", "Content", "Verified mastery", ""]}>
                {as.map((a) => {
                  const p = courseProgress(db, id, a);
                  return (
                    <tr key={a.id}>
                      <Td className="font-medium">{courseById(db, a.courseId)?.title}</Td>
                      <Td>{a.courseVersionId.split("-v").pop()}.0</Td>
                      <Td>{formatDate(a.assignedAt)}</Td>
                      <Td>{a.dueDate ? formatDate(a.dueDate) : "—"}</Td>
                      <Td className="w-32">
                        {p.contentPct}% <ProgressBar value={p.contentPct} label="Content" />
                      </Td>
                      <Td className="w-32">
                        {p.masteryPct}% <ProgressBar value={p.masteryPct} tone="green" label="Mastery" />
                      </Td>
                      <Td>
                        <Link href={`/pm/courses/${a.courseId}`} className="text-sm text-brand-600">
                          Preview
                        </Link>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
          <Card title="Assessment results" description="PMs review results here; quiz screens are user-only.">
            {attempts.length === 0 ? (
              <p className="text-sm text-muted">No attempts yet.</p>
            ) : (
              <Table head={["Assessment", "Attempt", "Submitted", "Objective", "Result", "Status", "Integrity", ""]}>
                {attempts.map((a) => {
                  const appeal = db.appeals.find((x) => x.attemptId === a.id && x.status === "OPEN");
                  return (
                    <tr key={a.id}>
                      <Td className="font-medium">{db.questionSets.find((s) => s.id === a.questionSetId)?.title}</Td>
                      <Td>#{a.attemptNo}</Td>
                      <Td>{formatDateTime(a.submittedAt)}</Td>
                      <Td>
                        {a.objectiveScore}/{a.objectiveTotal}
                      </Td>
                      <Td>{attemptPercent(a)}%</Td>
                      <Td>
                        <StatusBadge status={a.status === "FINAL" ? "Final" : a.status === "PENDING_OFFLINE" ? "Pending (offline)" : "Provisional"} />
                        {appeal && (
                          <span className="mt-1 block text-xs text-amber-800">
                            Appeal: {appeal.reason}
                          </span>
                        )}
                      </Td>
                      <Td>
                        {a.integrityEvents.length ? (
                          <span className="flex items-center gap-1 text-xs text-amber-800" title={a.integrityEvents.map((e) => `${e.type} ${e.at}`).join("\n")}>
                            <ShieldAlert className="h-3.5 w-3.5" /> {a.integrityEvents.map((e) => e.type.replace("_", " ").toLowerCase()).join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">None</span>
                        )}
                      </Td>
                      <Td>
                        {a.status !== "FINAL" && (
                          <Button size="sm" onClick={() => { setFinError(""); setFin({ id: a.id, score: attemptPercent(a), mastered: false }); }}>
                            Review & finalise
                          </Button>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>
      )}

      {part === "sprint" && (
        <Card title="Sprint & recent work — last 2 weeks">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">No sprint tasks in the last two weeks.</p>
          ) : (
            <Table head={["Date", "Task", "Category", "Owner & approval", "Planned", "Actual", "Done", "Blocker"]}>
              {tasks.map((x) => (
                <tr key={x.id}>
                  <Td>{formatDay(x.date)}</Td>
                  <Td className="font-medium">{x.title}</Td>
                  <Td>{x.category === "SBO" ? "SBU" : "L&D"}</Td>
                  <Td className="whitespace-normal">
                    {(() => {
                      const owner = db.taskOwners.find((o) => o.id === x.ownerId);
                      if (!owner) return <span className="text-muted">—</span>;
                      const mail = db.emailDeliveries.find((m) => m.taskId === x.id);
                      return (
                        <div className="space-y-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{owner.name}</span>
                            <Badge tone={x.verification === "VERIFIED" ? "green" : x.verification === "NOT_CONFIRMED" ? "red" : "amber"}>
                              {x.verification === "VERIFIED" ? "Approved" : x.verification === "NOT_CONFIRMED" ? "Declined" : "Awaiting approval"}
                            </Badge>
                          </span>
                          {mail && (
                            <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                              Email to {mail.recipient}: {mail.status === "FAILED" ? "not sent" : mail.status === "ACCEPTED" ? "sent" : "queued"}
                              {mail.status === "FAILED" && (
                                <button className="font-medium text-brand-600 hover:underline" onClick={() => retryEmail(mail.id)}>
                                  Retry
                                </button>
                              )}
                            </span>
                          )}
                          {x.verification === "PENDING" && (
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-muted">Simulate owner reply:</span>
                              <Button size="sm" variant="success" onClick={() => { const r = verifyTaskOwner(user.id, x.id, "VERIFIED"); toast(r.ok ? "Owner approved the task." : r.error, r.ok ? "success" : "error"); }}>
                                Approve
                              </Button>
                              <Button size="sm" variant="secondary" onClick={() => { const r = verifyTaskOwner(user.id, x.id, "NOT_CONFIRMED"); toast(r.ok ? "Owner declined the task." : r.error, r.ok ? "info" : "error"); }}>
                                Decline
                              </Button>
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </Td>
                  <Td>{x.plannedHours}h</Td>
                  <Td>{x.actualHours}h</Td>
                  <Td>{x.done ? <Badge tone="green">Done</Badge> : <Badge tone="gray">Open</Badge>}</Td>
                  <Td className="text-red-700">{x.blocker || ""}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {part === "attendance" && (
        <div className="space-y-6">
          <Card title="Office attendance — last 14 days">
            <OfficeAttendanceTable db={db} traineeIds={[id]} from={addDays(today, -14)} to={addDays(today, -1)} />
          </Card>
          <Card title="Teams meetings">
            <MeetingAttendanceTable db={db} rows={db.meetingAttendance.filter((m) => m.traineeUserId === id).sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart))} />
          </Card>
        </div>
      )}

      {part === "feedback" && (
        <div className="space-y-6">
          <Card title="Two-week task summary" description={`Daily sprint, ${formatDate(twoFrom)} – ${formatDate(today)}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard label="Completed candidate tasks" value={twoDone} hint={`Across ${twoDays.length} working days`} />
              <StatCard label="Sprint submissions" value={`${twoSubs.length} / ${twoDays.length}`} hint={`${twoSubs.filter((x) => !x.onTime).length} submitted after the cutoff`} />
            </div>
          </Card>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="L&D feedback" description="Kept separate from AI findings and report comments. Every save creates a new version.">
            <Textarea aria-label="L&D feedback" rows={5} value={fbValue} onChange={(e) => setFbText(e.target.value)} />
            <div className="mt-3 flex justify-end">
              <Button
                disabled={fbText == null || fbText === (feedback[0]?.text ?? "")}
                onClick={() => {
                  const r = saveFeedback(user.id, id, fbValue);
                  if (!r.ok) return toast(r.error, "error");
                  setFbText(null);
                  toast("Feedback saved as a new version.");
                }}
              >
                Save feedback
              </Button>
            </div>
            {feedback.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Version history</p>
                <ul className="space-y-2">
                  {feedback.map((f) => (
                    <li key={f.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                      <p className="text-xs text-muted">
                        v{f.version} · {nameOf(db, f.authorId)} · {formatDateTime(f.createdAt)}
                      </p>
                      <p className="mt-1">{f.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card title="Recognition">
            <p className="text-sm text-muted">Engagement only — not a performance rating.</p>
            <p className="mt-3 text-2xl font-semibold">{xp} XP</p>
            <p className="text-sm">
              Level {levelFor(db, xp).level.name} · streak {streakOf(db, id)} days
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {badges.length ? (
                badges.map((b) => {
                  const bd = db.badges.find((x) => x.id === b.badgeId)!;
                  return (
                    <Badge key={b.badgeId} tone="purple">
                      {bd.icon} {bd.name}
                    </Badge>
                  );
                })
              ) : (
                <span className="text-sm text-muted">No badges yet.</span>
              )}
            </div>
          </Card>
        </div>
        </div>
      )}

      {edit > 0 && <TraineeFormDialog key={edit} db={db} pmId={user.id} editUserId={id} open onClose={() => setEdit(0)} onSaved={(m) => toast(m)} />}

      <Dialog
        open={!!fin}
        onClose={() => setFin(null)}
        title="Review and finalise result"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFin(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = finaliseAttempt(user.id, fin!.id, fin!.score, fin!.mastered);
                if (!r.ok) return setFinError(r.error);
                setFin(null);
                toast("Result finalised. The original objective score is preserved.");
              }}
            >
              Approve final score
            </Button>
          </>
        }
      >
        {fin &&
          (() => {
            const a = db.attempts.find((x) => x.id === fin.id)!;
            const set = db.questionSets.find((s) => s.id === a.questionSetId)!;
            const short = set.questions.filter((q) => q.type === "SHORT");
            return (
              <>
                <Alert tone="blue">
                  Rubric: {set.rubric}. AI-assisted scoring is not connected — score short answers manually.
                </Alert>
                <p className="text-sm">
                  Objective score: {a.objectiveScore}/{a.objectiveTotal} · {SUBMIT_REASON[a.submitReason]}
                </p>
                {(() => {
                  const appeal = db.appeals.find((x) => x.attemptId === a.id && x.status === "OPEN");
                  return appeal ? (
                    <Alert tone="amber" title="Appeal">
                      {appeal.reason} <span className="text-xs">({formatDateTime(appeal.createdAt)})</span>
                    </Alert>
                  ) : null;
                })()}
                <div className="rounded-lg border border-line p-3 text-sm">
                  <p className="mb-1 flex items-center gap-1.5 font-medium">
                    <ShieldAlert className="h-4 w-4 text-amber-700" aria-hidden /> Integrity events
                  </p>
                  {a.integrityEvents.length === 0 ? (
                    <p className="text-muted">None recorded.</p>
                  ) : (
                    <ul className="space-y-0.5 text-muted">
                      {a.integrityEvents.map((e, i) => (
                        <li key={i}>
                          {formatDateTime(e.at)} · {e.type.replaceAll("_", " ").toLowerCase()}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted">Review signals, not proof.</p>
                </div>
                {short.map((q) => (
                  <div key={q.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="font-medium">{q.text}</p>
                    <p className="mt-1 whitespace-pre-wrap text-muted">{a.answers[q.id] || "No answer saved"}</p>
                  </div>
                ))}
                <Field label="Final score (%)" htmlFor="fs" error={finError}>
                  <Input id="fs" type="number" min={0} max={100} value={fin.score} onChange={(e) => setFin({ ...fin, score: Number(e.target.value) })} />
                </Field>
                <Checkbox label="Mark this topic as mastered (awards XP)" checked={fin.mastered} onChange={(v) => setFin({ ...fin, mastered: v })} />
              </>
            );
          })()}
      </Dialog>
    </div>
  );
}
