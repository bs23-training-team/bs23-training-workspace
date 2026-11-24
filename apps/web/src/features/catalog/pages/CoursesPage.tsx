"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { useMe } from "@/features/shell";
import { addCourse, approveSuggestion, assignCourse, decideCourseRequest, suggestedCourses } from "../api";
import { courseById, publishedVersion } from "@/features/learning";
import { integration, nameOf, pmPeople, pmTrainees, traineeOf } from "@/lib/mock/selectors";
import { latestEvaluation } from "@/features/assessment";
import { TRACKS } from "@/lib/mock/content";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, IntegrationStatus, PageHeader, Select, StatusBadge, Table, Td, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, todayISO } from "@/lib/utils";

export default function CoursesPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const trainees = pmTrainees(db, user.id);
  const people = pmPeople(db, user.id);
  const myTeams = db.teams.filter((t) => t.pmId === user.id);
  const [sel, setSel] = useState(people[0]?.userId ?? "");
  const [assign, setAssign] = useState<{ courseId: string; mode: "trainee" | "team"; target: string; due: string } | null>(null);
  const [assignError, setAssignError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [nc, setNc] = useState({ title: "", track: "Frontend", description: "", topics: "", resources: "" });
  const [addError, setAddError] = useState("");

  const roadmap = integration(db, "ROADMAP");
  const [courseQ, setCourseQ] = useState("");
  const scopeIds = new Set(people.map((t) => t.userId));
  const requests = db.courseRequests.filter((r) => r.status === "PENDING" && scopeIds.has(r.traineeUserId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const allCourses = db.courses.filter((c) => !courseQ || `${c.title} ${c.track} ${c.description}`.toLowerCase().includes(courseQ.toLowerCase()));
  const decide = (id: string, approve: boolean) => {
    const r = decideCourseRequest(user.id, id, approve);
    toast(r.ok ? (approve ? "Request approved. The course is assigned and the user is notified." : "Request declined. The user is notified.") : r.error, r.ok ? "success" : "error");
  };
  const openAssign = (courseId: string, traineeId?: string) => {
    setAssignError("");
    setAssign({ courseId, mode: "trainee", target: traineeId ?? trainees[0]?.userId ?? "", due: "" });
  };

  const doAssign = () => {
    if (!assign) return;
    const r = assignCourse(user.id, assign.courseId, assign.mode === "team" ? { teamId: assign.target } : { traineeIds: [assign.target] }, assign.due || undefined);
    if (!r.ok) return setAssignError(r.error);
    toast(`Assigned to ${r.data} user(s). They have been notified.`);
    setAssign(null);
  };

  return (
    <div>
      <PageHeader
        title="Learning Roadmap"
        description="Handle course requests, review suggestions from skill gaps, and assign or preview any course. Nothing is assigned without you."
        actions={
          <Button onClick={() => { setAddError(""); setAddOpen(true); }}>
            <Plus className="h-4 w-4" /> Add course
          </Button>
        }
      />
      <div className="mb-4">
        <IntegrationStatus name="Roadmap API" status={roadmap.status} lastSync={roadmap.lastSync} />
      </div>
      <Card className="mb-6" title={`Course requests${requests.length ? ` (${requests.length})` : ""}`} description="Courses your users asked for. Approve assigns the course; either decision notifies the user.">
        {requests.length === 0 ? (
          <p className="text-sm text-muted">No pending course requests.</p>
        ) : (
          <Table head={["User", "Course", "Reason", "Requested", ""]}>
            {requests.map((r) => {
              const t = traineeOf(db, r.traineeUserId);
              return (
                <tr key={r.id}>
                  <Td className="font-medium">
                    {nameOf(db, r.traineeUserId)}
                    <span className="block text-xs font-normal text-muted">{t?.traineeId}</span>
                  </Td>
                  <Td>{courseById(db, r.courseId)?.title ?? "Unknown course"}</Td>
                  <Td className="max-w-sm whitespace-normal">{r.reason}</Td>
                  <Td>{formatDate(r.createdAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => decide(r.id, false)}>
                        Decline
                      </Button>
                      <Button size="sm" variant="success" onClick={() => decide(r.id, true)}>
                        Approve
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Suggested courses</h2>
      <div>
          <div className="mb-4 flex items-center gap-2">
            <label htmlFor="st" className="text-sm text-muted">
              User
            </label>
            <Select id="st" value={sel} onChange={(e) => setSel(e.target.value)} className="w-72">
              {people.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {nameOf(db, t.userId)} ({t.traineeId}){t.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </Select>
          </div>
          <Alert tone="amber">AI personalisation is not connected; suggestions come from the user&apos;s skill gaps. Approve a suggestion before assigning it.</Alert>
          <div className="mt-4">
            {!latestEvaluation(db, sel) ? (
              <EmptyState title="No suggestions yet" description="This user has no skill analysis yet." />
            ) : suggestedCourses(db, sel).length === 0 ? (
              <EmptyState title="No open suggestions" description="Every suggested course is already assigned." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {suggestedCourses(db, sel).map(({ course, reason, priority, approved }) => (
                  <Card key={course.id} title={course.title} description={course.description} action={<Badge tone="blue">{course.track}</Badge>}>
                    <p className="text-sm">
                      <span className="text-muted">Why: </span>
                      {reason}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={`${priority} priority`} />
                      {approved ? <Badge tone="green">PM approved</Badge> : <Badge tone="gray">Awaiting your approval</Badge>}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {!approved && (
                        <Button size="sm" variant="secondary" onClick={() => { approveSuggestion(user.id, sel, course.id); toast("Suggestion approved."); }}>
                          Approve
                        </Button>
                      )}
                      <Button size="sm" disabled={!approved} onClick={() => openAssign(course.id, sel)}>
                        Assign
                      </Button>
                      <Link href={`/pm/courses/${course.id}`} className="inline-flex h-8 items-center px-3 text-sm text-brand-600">
                        Preview
                      </Link>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

      <Card className="mt-8" title={`All courses (${db.courses.length})`} description="Assign or preview any course, including courses you added. Assigning never needs a suggestion.">
        <div className="mb-4">
          <Input aria-label="Search courses" placeholder="Search by name, track or description" value={courseQ} onChange={(e) => setCourseQ(e.target.value)} className="sm:max-w-sm" />
        </div>
        {allCourses.length === 0 ? (
          <p className="text-sm text-muted">No course matches.</p>
        ) : (
          <Table head={["Course", "Track", "Source", "Topics", "Assigned to", ""]}>
            {allCourses.map((c) => (
              <tr key={c.id}>
                <Td className="max-w-xs whitespace-normal">
                  <span className="font-medium">{c.title}</span>
                  {c.description && <span className="block text-xs text-muted">{c.description}</span>}
                </Td>
                <Td>
                  <Badge tone="blue">{c.track}</Badge>
                </Td>
                <Td>{c.source === "PM_ADDED" ? "PM-added" : "Roadmap API (sample)"}</Td>
                <Td>{publishedVersion(c).topics.length}</Td>
                <Td>{db.assignments.filter((a) => a.courseId === c.id && scopeIds.has(a.traineeUserId)).length} user(s)</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Link href={`/pm/courses/${c.id}`} className="inline-flex h-8 items-center px-3 text-sm text-brand-600">
                      Preview
                    </Link>
                    <Button size="sm" onClick={() => openAssign(c.id, trainees.some((t) => t.userId === sel) ? sel : undefined)}>
                      Assign
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Dialog
        open={!!assign}
        onClose={() => setAssign(null)}
        title={`Assign ${assign ? courseById(db, assign.courseId)?.title : ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssign(null)}>
              Cancel
            </Button>
            <Button onClick={doAssign}>Assign course</Button>
          </>
        }
      >
        {assign && (
          <>
            {assignError && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {assignError}
              </p>
            )}
            <Field label="Assign to" htmlFor="am">
              <Select id="am" value={assign.mode} onChange={(e) => setAssign({ ...assign, mode: e.target.value as "trainee" | "team", target: e.target.value === "team" ? myTeams[0]?.id ?? "" : trainees[0]?.userId ?? "" })}>
                <option value="trainee">One user</option>
                <option value="team">A whole team</option>
              </Select>
            </Field>
            <Field label={assign.mode === "team" ? "Team" : "User"} htmlFor="at">
              <Select id="at" value={assign.target} onChange={(e) => setAssign({ ...assign, target: e.target.value })}>
                {assign.mode === "team"
                  ? myTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  : trainees.map((t) => (
                      <option key={t.userId} value={t.userId}>
                        {nameOf(db, t.userId)} ({t.traineeId})
                      </option>
                    ))}
              </Select>
            </Field>
            <Field label="Due date (optional)" htmlFor="ad">
              <Input id="ad" type="date" min={todayISO()} value={assign.due} onChange={(e) => setAssign({ ...assign, due: e.target.value })} />
            </Field>
            <p className="text-xs text-muted">The assignment is pinned to the published roadmap version and keeps any earlier learning history.</p>
          </>
        )}
      </Dialog>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add course"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = addCourse(user.id, nc);
                if (!r.ok) return setAddError(r.error);
                setAddOpen(false);
                setNc({ title: "", track: "Frontend", description: "", topics: "", resources: "" });
                toast("Course added. Author the lesson content and question pool next.");
              }}
            >
              Save course
            </Button>
          </>
        }
      >
        {addError && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {addError}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Course name" htmlFor="cn" required hint="Must be unique">
            <Input id="cn" value={nc.title} onChange={(e) => setNc({ ...nc, title: e.target.value })} />
          </Field>
          <Field label="Track" htmlFor="ctr" required>
            <Select id="ctr" value={nc.track} onChange={(e) => setNc({ ...nc, track: e.target.value })}>
              {TRACKS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Description" htmlFor="cd">
          <Textarea id="cd" value={nc.description} onChange={(e) => setNc({ ...nc, description: e.target.value })} />
        </Field>
        <Field label="Roadmap topics" htmlFor="ctp" required hint="One topic per line">
          <Textarea id="ctp" rows={5} value={nc.topics} onChange={(e) => setNc({ ...nc, topics: e.target.value })} />
        </Field>
        <Field label="Resource URLs (optional)" htmlFor="cru" hint="One per line. HTTPS only.">
          <Textarea id="cru" value={nc.resources} onChange={(e) => setNc({ ...nc, resources: e.target.value })} />
        </Field>
      </Dialog>
    </div>
  );
}
