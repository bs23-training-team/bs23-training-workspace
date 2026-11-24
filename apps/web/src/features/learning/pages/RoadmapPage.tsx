"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import { useMe } from "@/features/shell";
import { assignmentsOf, courseById, courseProgress } from "../api";
import { requestCourse } from "@/features/catalog";
import { TRACKS } from "@/lib/mock/content";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, ProgressBar, Select, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";

export default function RoadmapPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("");
  const [tab, setTab] = useState<"progress" | "completed">("progress");
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState({ courseId: "", reason: "" });
  const [error, setError] = useState("");

  const rows = assignmentsOf(db, user.id)
    .map((a) => ({ a, c: courseById(db, a.courseId)!, p: courseProgress(db, user.id, a) }))
    .filter(({ c }) => (!track || c.track === track) && (!q || `${c.title} ${c.description}`.toLowerCase().includes(q.toLowerCase())))
    .filter(({ p }) => (tab === "completed" ? p.contentPct === 100 : p.contentPct < 100));
  const assignedIds = new Set(assignmentsOf(db, user.id).map((a) => a.courseId));
  const requestable = db.courses.filter((c) => !assignedIds.has(c.id));
  const myRequests = db.courseRequests.filter((r) => r.traineeUserId === user.id);

  const submit = () => {
    if (!req.courseId) return setError("Choose a course.");
    const r = requestCourse(user.id, req.courseId, req.reason);
    if (!r.ok) return setError(r.error);
    setOpen(false);
    setReq({ courseId: "", reason: "" });
    toast("Course request sent. It grants no access until your PM approves it.");
  };

  return (
    <div>
      <PageHeader title="Learning Roadmap" description="Your assigned courses. The roadmap graph is the same for everyone on a version; your topic states are personal." actions={<Button onClick={() => { setError(""); setOpen(true); }}>Request a course</Button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search courses" placeholder="Search by course or topic" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select aria-label="Filter by track" value={track} onChange={(e) => setTrack(e.target.value)} className="w-48">
          <option value="">All tracks</option>
          {TRACKS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Select>
      </div>
      <Tabs label="Course status" value={tab} onChange={setTab} tabs={[{ id: "progress", label: "In progress" }, { id: "completed", label: "Completed" }]} />
      {rows.length === 0 ? (
        <EmptyState title={tab === "completed" ? "No completed courses yet" : "No courses in progress"} description="Courses appear here once your PM assigns them or approves your request." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ a, c, p }) => (
            <Link key={a.id} href={`/trainee/roadmap/${c.id}`} className="rounded-xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.title}</p>
                  <p className="mt-1 text-sm text-muted">{c.description}</p>
                </div>
                <Badge tone="blue">{c.track}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs text-muted">
                <div>
                  Content {p.contentPct}% ({p.done}/{p.total} lessons)
                  <ProgressBar value={p.contentPct} label="Content" />
                </div>
                <div>
                  Verified mastery {p.masteryPct}% ({p.mastered}/{p.topics} topics)
                  <ProgressBar value={p.masteryPct} tone="green" label="Mastery" />
                </div>
              </div>
              <p className="mt-3 text-xs text-muted">
                Version {a.courseVersionId.split("-v")[1] ?? "1"}.0 · {a.dueDate ? `Due ${formatDate(a.dueDate)}` : "No due date"}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Card className="mt-8" title="My course requests">
        {myRequests.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t requested any course.</p>
        ) : (
          <Table head={["Course", "Reason", "Requested", "Status"]}>
            {myRequests.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{courseById(db, r.courseId)?.title}</Td>
                <Td className="max-w-sm whitespace-normal">{r.reason}</Td>
                <Td>{formatDate(r.createdAt)}</Td>
                <Td>
                  <StatusBadge status={r.status === "PENDING" ? "Pending" : r.status === "APPROVED" ? "Approved" : "Declined"} />
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Request a course"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Send request</Button>
          </>
        }
      >
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Course" htmlFor="rc" required>
          <Select id="rc" value={req.courseId} onChange={(e) => setReq({ ...req, courseId: e.target.value })}>
            <option value="">Choose a course</option>
            {requestable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.track})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="rr" required hint="Why do you need this course now?">
          <Textarea id="rr" value={req.reason} onChange={(e) => setReq({ ...req, reason: e.target.value })} />
        </Field>
      </Dialog>
    </div>
  );
}
