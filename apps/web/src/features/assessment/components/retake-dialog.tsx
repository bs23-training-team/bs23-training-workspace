"use client";

import { useState } from "react";
import type { DB } from "@/lib/mock/types";
import { decideRetake } from "../mock-api";
import { Button, Field, Input, StatusBadge } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { RESOURCE_LABEL, formatDateTime } from "@/lib/utils";

/**
 * Pop-up a PM opens from a "Retake approval needed" notification. The PM sees who is asking,
 * sets the time allowed and total marks, then approves or rejects.
 */
export function RetakeDecisionDialog({ db, pmId, requestId, onClose, onDone }: { db: DB; pmId: string; requestId: string; onClose: () => void; onDone: (msg: string, ok: boolean) => void }) {
  const req = db.retakeRequests.find((r) => r.id === requestId);
  const t = req ? db.trainees.find((x) => x.userId === req.traineeUserId) : undefined;
  const u = req ? db.users.find((x) => x.id === req.traineeUserId) : undefined;
  const [minutes, setMinutes] = useState<number>(() => t?.skillAssessmentMinutes ?? 20);
  const [marks, setMarks] = useState<number>(() => t?.skillAssessmentMarks ?? 20);
  const [error, setError] = useState("");

  const decide = (approve: boolean) => {
    const r = decideRetake(pmId, requestId, approve, approve ? { minutes, totalMarks: marks } : undefined);
    if (!r.ok) return setError(r.error);
    onDone(approve ? `Retake approved for ${u?.name}.` : `Retake rejected for ${u?.name}.`, true);
    onClose();
  };

  const pending = req?.status === "PENDING";
  return (
    <Dialog
      open
      onClose={onClose}
      title="Retake approval"
      footer={
        pending ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => decide(false)}>
              Reject
            </Button>
            <Button variant="success" onClick={() => decide(true)}>
              Approve
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {!req || !t || !u ? (
        <p className="text-sm text-muted">This request no longer exists.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <p className="text-sm text-muted">
            {u.name} asked to retake the skill assessment on {formatDateTime(req.createdAt)}. Their earlier reports stay in their history.
          </p>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">User</h3>
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
              <Field label="User ID" htmlFor="rid">
                <Input id="rid" value={t.traineeId} readOnly />
              </Field>
              <Field label="User name" htmlFor="rname">
                <Input id="rname" value={u.name} readOnly />
              </Field>
            </div>
            <p className="text-xs text-muted">{RESOURCE_LABEL[t.resource]}</p>
          </section>
          {pending ? (
            <section className="space-y-3 border-t border-line pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Retake skill assessment</h3>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label="Time allowed" htmlFor="rmin" required>
                  <div className="relative">
                    <Input id="rmin" type="number" min={1} max={180} step={1} className="pr-14" value={Number.isNaN(minutes) ? "" : minutes} onChange={(e) => setMinutes(e.target.valueAsNumber)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">min</span>
                  </div>
                </Field>
                <Field label="Total marks" htmlFor="rmarks" required>
                  <div className="relative">
                    <Input id="rmarks" type="number" min={1} max={1000} step={1} className="pr-16" value={Number.isNaN(marks) ? "" : marks} onChange={(e) => setMarks(e.target.valueAsNumber)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">marks</span>
                  </div>
                </Field>
              </div>
              <p className="text-xs text-muted">Marks are shared equally across the questions. One approval allows one retake. Time and marks only apply when you approve.</p>
            </section>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              This request is <StatusBadge status={req.status === "USED" ? "Approved · used" : req.status === "APPROVED" ? "Approved" : "Rejected"} />
              {req.minutes != null && (
                <span className="text-muted">
                  {req.minutes} min · {req.totalMarks} marks
                </span>
              )}
            </p>
          )}
        </>
      )}
    </Dialog>
  );
}
