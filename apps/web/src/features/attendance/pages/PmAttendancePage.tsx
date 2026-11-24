"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useMe } from "@/features/shell";
import { addManualAttendance, decideLeave, mapTeamsIdentity, resolveReconciliation } from "../api";
import { integration, nameOf, pmPeople } from "@/lib/mock/selectors";
import { MeetingAttendanceTable } from "../components/attendance";
import { ErpAttendance, dmy, reconDates } from "../components/erp-attendance-table";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { addDays, formatDate, formatDateTime, todayISO } from "@/lib/utils";

export default function AttendancePage() {
  const { db, user } = useMe();
  const toast = useToast();
  const today = todayISO();
  const trainees = pmPeople(db, user.id);
  const ids = trainees.map((t) => t.userId);
  const [tab, setTab] = useState<"erp" | "teams" | "leave">("erp");
  // Four user pickers (Trainee, Central L&D, Industrial attachment, SBU) list the same people; the one used last applies.
  const [pick, setPick] = useState<{ trainee: string; central: string; industrial: string; sbu: string }>({ trainee: "", central: "", industrial: "", sbu: "" });
  const who = pick.trainee || pick.central || pick.industrial || pick.sbu;
  const choose = (key: keyof typeof pick, value: string) => setPick({ trainee: "", central: "", industrial: "", sbu: "", [key]: value });
  const [from, setFrom] = useState(addDays(today, -14));
  const [to, setTo] = useState(addDays(today, -1));
  const [manual, setManual] = useState<{ traineeUserId: string; date: string; entry: string; exit: string } | null>(null);
  const [manualError, setManualError] = useState("");
  const [decision, setDecision] = useState<{ id: string; approve: boolean; note: string } | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<{ title: string; message: string; label: string; run: () => void } | null>(null);
  const done = (r: { ok: boolean; error?: string }, msg: string) => toast(r.ok ? msg : r.error ?? "Something went wrong.", r.ok ? "success" : "error");
  const erp = integration(db, "ERP");
  const selected = who ? [who] : ids;
  const recon = db.reconciliations.filter((r) => ids.includes(r.traineeUserId));
  const leaves = db.leaveRequests.filter((l) => ids.includes(l.traineeUserId) && (!who || l.traineeUserId === who)).sort((a, b) => (a.status === "PENDING" ? -1 : 1) - (b.status === "PENDING" ? -1 : 1));
  const meetings = db.meetingAttendance
    .filter((m) => (m.traineeUserId ? selected.includes(m.traineeUserId) : !who) && m.scheduledStart.slice(0, 10) >= from && m.scheduledStart.slice(0, 10) <= to)
    .sort((a, b) => b.scheduledStart.localeCompare(a.scheduledStart));
  const unmapped = db.meetingAttendance.filter((m) => m.status === "UNMAPPED");
  const reviewed = decision ? db.leaveRequests.find((x) => x.id === decision.id) : undefined;

  return (
    <div>
      <PageHeader title="Attendance" description="ERP is the official source for office attendance. Unavailable data is never counted as absence or zero hours." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Trainee" htmlFor="aw">
          <Select id="aw" value={pick.trainee} onChange={(e) => choose("trainee", e.target.value)} className="w-56">
            <option value="">All users</option>
            {trainees.map((t) => (
              <option key={t.userId} value={t.userId}>
                {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Central L&D" htmlFor="awc">
          <Select id="awc" value={pick.central} onChange={(e) => choose("central", e.target.value)} className="w-56">
            <option value="">All Central L&D</option>
            {trainees.map((t) => (
              <option key={t.userId} value={t.userId}>
                {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Industrial attachment" htmlFor="awi">
          <Select id="awi" value={pick.industrial} onChange={(e) => choose("industrial", e.target.value)} className="w-56">
            <option value="">All industrial attachment</option>
            {trainees.map((t) => (
              <option key={t.userId} value={t.userId}>
                {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="SBU" htmlFor="aws">
          <Select id="aws" value={pick.sbu} onChange={(e) => choose("sbu", e.target.value)} className="w-56">
            <option value="">All SBU</option>
            {trainees.map((t) => (
              <option key={t.userId} value={t.userId}>
                {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {tab === "teams" && (
          <>
            <Field label="From" htmlFor="af">
              <Input id="af" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </Field>
            <Field label="To" htmlFor="at">
              <Input id="at" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </Field>
          </>
        )}
      </div>
      <Tabs
        label="Attendance sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "erp", label: "ERP attendance" },
          { id: "teams", label: "Teams meetings" },
          { id: "leave", label: `Leave requests${leaves.filter((l) => l.status === "PENDING").length ? ` (${leaves.filter((l) => l.status === "PENDING").length})` : ""}` },
        ]}
      />

      {tab === "erp" && (
        <div className="space-y-6">
          <Card
            title="ERP attendance"
            description="Fetched from the Brain Station 23 ERP API."
            action={
              erp.status !== "Connected" && (
                <Button size="sm" variant="secondary" onClick={() => { setManualError(""); setManual({ traineeUserId: who || ids[0], date: addDays(today, -1), entry: "09:00", exit: "18:00" }); }}>
                  <Plus className="h-4 w-4" /> Add PM-entered record
                </Button>
              )
            }
          >
            <ErpAttendance key={who || "all"} db={db} traineeIds={selected} />
          </Card>
          <Card title="Reconciliation requests" description="Source records are never edited; corrections are reconciled with a reason.">
            {recon.length === 0 ? (
              <p className="text-sm text-muted">No reconciliation requests.</p>
            ) : (
              <Table head={["User", "Dates", "What is wrong", "Requested", "Status", ""]}>
                {recon.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium">{nameOf(db, r.traineeUserId)}</Td>
                    <Td className="max-w-xs whitespace-normal">
                      {reconDates(r.recordRef)?.map((d) => (
                        <Badge key={d} className="mr-1">
                          {dmy(d)}
                        </Badge>
                      )) ?? r.recordRef}
                    </Td>
                    <Td className="max-w-xs whitespace-normal">{r.reason}</Td>
                    <Td>{formatDateTime(r.createdAt)}</Td>
                    <Td>
                      <StatusBadge status={r.status === "OPEN" ? "Pending" : "Resolved"} />
                    </Td>
                    <Td>
                      {r.status === "OPEN" && (
                        <Button size="sm" variant="secondary" onClick={() => setAsk({ title: "Mark as resolved?", message: `Mark ${nameOf(db, r.traineeUserId)}'s reconciliation request as resolved? Fix or add the attendance record first. This cannot be undone.`, label: "Mark resolved", run: () => done(resolveReconciliation(user.id, r.id), "Request marked resolved.") })}>
                          Mark resolved
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "teams" && (
        <div className="space-y-6">
          {unmapped.length > 0 && (
            <Card title="Unmapped Teams identities" description="Map each Teams identity to a user. Until mapped, it is not counted for anyone.">
              <ul className="space-y-2">
                {unmapped.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono text-xs">{m.teamsIdentity}</span>
                    <Select aria-label="User to map" className="w-56" value={mapping[m.id] ?? ""} onChange={(e) => setMapping({ ...mapping, [m.id]: e.target.value })}>
                      <option value="">Choose user</option>
                      {trainees.map((t) => (
                        <option key={t.userId} value={t.userId}>
                          {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
                        </option>
                      ))}
                    </Select>
                    <Button size="sm" disabled={!mapping[m.id]} onClick={() => setAsk({ title: "Map this Teams identity?", message: `Map ${m.teamsIdentity} to ${nameOf(db, mapping[m.id])}? Their meetings will count for this user. This cannot be undone here.`, label: "Map identity", run: () => done(mapTeamsIdentity(user.id, m.id, mapping[m.id]), "Identity mapped.") })}>
                      Map
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title="Meeting punctuality" description="A pending meeting report is not an absence.">
            {from > to ? <Alert tone="red">End date cannot precede start date</Alert> : <MeetingAttendanceTable db={db} rows={meetings} showName />}
          </Card>
        </div>
      )}

      {tab === "leave" && (
        <Card>
          {leaves.length === 0 ? (
            <EmptyState title="No leave requests" />
          ) : (
            <Table head={["User", "Leave period", "Type / reason", "Status", "Decision"]}>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <span className="font-medium">{nameOf(db, l.traineeUserId)}</span>
                    <span className="block text-xs text-muted">{db.trainees.find((t) => t.userId === l.traineeUserId)?.traineeId}</span>
                  </Td>
                  <Td>
                    {formatDate(l.start)} – {formatDate(l.end)}
                  </Td>
                  <Td className="max-w-md whitespace-normal">
                    <span className="font-medium">{l.type} leave</span>
                    <span className="block text-muted">{l.reason}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={l.status === "PENDING" ? "Pending" : l.status === "APPROVED" ? "Approved" : "Declined"} />
                  </Td>
                  <Td className="max-w-xs whitespace-normal">
                    {l.status === "PENDING" ? (
                      <Button size="sm" onClick={() => { setDecisionError(""); setDecision({ id: l.id, approve: true, note: "" }); }}>
                        Review
                      </Button>
                    ) : (
                      <span className="text-xs text-muted">{l.review ? `${l.review} — ${nameOf(db, l.reviewerId)}, ${formatDateTime(l.reviewedAt)}` : "—"}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      <Dialog
        open={!!decision}
        onClose={() => setDecision(null)}
        title="Review leave request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = decideLeave(user.id, decision!.id, decision!.approve, decision!.note);
                if (!r.ok) return setDecisionError(r.error);
                setDecision(null);
                toast("Decision recorded. The user has been notified.");
              }}
            >
              Save decision
            </Button>
          </>
        }
      >
        {decision && (
          <>
            {reviewed && (
              <div>
                <p className="text-sm text-muted">
                  {nameOf(db, reviewed.traineeUserId)} · {formatDate(reviewed.start)} – {formatDate(reviewed.end)}
                </p>
                <p className="mt-2 text-sm">{reviewed.reason}</p>
              </div>
            )}
            <Field label="Decision" htmlFor="dd">
              <Select id="dd" value={decision.approve ? "APPROVED" : "DECLINED"} onChange={(e) => setDecision({ ...decision, approve: e.target.value === "APPROVED" })}>
                <option value="APPROVED">Approved</option>
                <option value="DECLINED">Declined</option>
              </Select>
            </Field>
            <Field label="Review note" htmlFor="dn" required error={decisionError}>
              <Textarea id="dn" value={decision.note} onChange={(e) => setDecision({ ...decision, note: e.target.value })} />
            </Field>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!manual}
        onClose={() => setManual(null)}
        title="Add PM-entered attendance"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManual(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const r = addManualAttendance(user.id, manual!);
                if (!r.ok) return setManualError(r.error);
                setManual(null);
                toast('Record added and marked "PM-entered".');
              }}
            >
              Save record
            </Button>
          </>
        }
      >
        {manual && (
          <>
            <Alert tone="amber">Allowed while ERP is not connected. The record is labelled “PM-entered” everywhere it appears.</Alert>
            {manualError && (
              <p role="alert" className="text-sm text-red-600">
                {manualError}
              </p>
            )}
            <Field label="User" htmlFor="mtr">
              <Select id="mtr" value={manual.traineeUserId} onChange={(e) => setManual({ ...manual, traineeUserId: e.target.value })}>
                {trainees.filter((t) => t.attendanceMode === "PHYSICAL").map((t) => (
                  <option key={t.userId} value={t.userId}>
                    {nameOf(db, t.userId)}{t.archivedAt ? " (archived)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Date" htmlFor="mdt">
                <Input id="mdt" type="date" max={today} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
              </Field>
              <Field label="Entry" htmlFor="men">
                <Input id="men" type="time" value={manual.entry} onChange={(e) => setManual({ ...manual, entry: e.target.value })} />
              </Field>
              <Field label="Exit" htmlFor="mex" hint="Leave empty if unknown">
                <Input id="mex" type="time" value={manual.exit} onChange={(e) => setManual({ ...manual, exit: e.target.value })} />
              </Field>
            </div>
          </>
        )}
      </Dialog>
      <ConfirmDialog open={!!ask} title={ask?.title ?? ""} message={ask?.message} confirmLabel={ask?.label ?? "Confirm"} onConfirm={() => ask?.run()} onClose={() => setAsk(null)} />
    </div>
  );
}
