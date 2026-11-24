"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useMe } from "@/components/layout/hooks";
import { requestLeave, requestReconciliation } from "@/lib/api";
import type { LeaveRequest } from "@/lib/types";
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, StatusBadge, Table, Tabs, Td, Textarea } from "@/components/ui/ui";
import { ErpAttendance, dmy, reconDates, reconRef } from "@/components/domain/erp-attendance-table";
import { DateMultiPicker } from "@/components/domain/date-multi-picker";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, todayISO } from "@/lib/utils";

export default function ERPPage() {
  const { db, user } = useMe();
  const toast = useToast();
  type Tab = "leave" | "erp" | "reconciliation";
  // `?tab=erp` (View Attendance History on the dashboard) opens the ERP attendance tab directly.
  const [tab, setTab] = useState<Tab>(() => {
    const q = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab");
    return q === "erp" || q === "reconciliation" ? q : "leave";
  });
  const [leave, setLeave] = useState({ start: "", end: "", type: "Personal" as LeaveRequest["type"], reason: "" });
  const [leaveError, setLeaveError] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [reconError, setReconError] = useState("");
  const today = todayISO();
  const myLeave = db.leaveRequests.filter((l) => l.traineeUserId === user.id);
  const myRecon = db.reconciliations.filter((r) => r.traineeUserId === user.id);

  const submitLeave = () => {
    const r = requestLeave(user.id, leave);
    if (!r.ok) return setLeaveError(r.error);
    setLeaveError("");
    setLeave({ start: "", end: "", type: "Personal", reason: "" });
    toast("Leave request sent to your PM.");
  };

  const submitRecon = () => {
    if (dates.length === 0) return setReconError("Select at least one date on the calendar.");
    const r = requestReconciliation(user.id, reconRef(dates), reason);
    if (!r.ok) return setReconError(r.error);
    setReconError("");
    setDates([]);
    setReason("");
    toast("Reconciliation request sent to your PM. The ERP records stay unchanged.");
  };

  return (
    <div>
      <PageHeader title="ERP" description="Leave requests, your ERP attendance and reconciliation requests." />
      <Tabs label="ERP sections" value={tab} onChange={setTab} tabs={[{ id: "leave", label: "Leave request" }, { id: "erp", label: "ERP attendance" }, { id: "reconciliation", label: "Reconciliation request" }]} />

      {tab === "erp" && (
        <div className="space-y-4">
          <Alert tone="blue">Attendance is fetched from the Brain Station 23 ERP API. Missing source data is never counted as absence or zero hours. If something is wrong, send a reconciliation request.</Alert>
          <ErpAttendance db={db} traineeIds={[user.id]} />
        </div>
      )}

      {tab === "leave" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Request leave">
            <div className="space-y-3">
              {leaveError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {leaveError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="lf" required>
                  <Input id="lf" type="date" value={leave.start} onChange={(e) => setLeave({ ...leave, start: e.target.value })} />
                </Field>
                <Field label="To" htmlFor="lt" required error={leave.start && leave.end && leave.end < leave.start ? "End date cannot precede start date" : undefined}>
                  <Input id="lt" type="date" value={leave.end} onChange={(e) => setLeave({ ...leave, end: e.target.value })} />
                </Field>
              </div>
              <Field label="Type" htmlFor="ltp">
                <Select id="ltp" value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value as LeaveRequest["type"] })}>
                  <option>Personal</option>
                  <option>Annual</option>
                  <option>Other approved</option>
                </Select>
              </Field>
              <Field label="Reason" htmlFor="lr" required hint="Visible only to your PM.">
                <Textarea id="lr" value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} />
              </Field>
              <Button className="w-full" onClick={submitLeave}>
                Send request
              </Button>
            </div>
          </Card>
          <Card className="lg:col-span-2" title="My leave requests">
            {myLeave.length === 0 ? (
              <p className="text-sm text-muted">No leave requests yet.</p>
            ) : (
              <Table head={["Dates", "Type", "Reason", "Status", "PM note"]}>
                {myLeave.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      {formatDate(l.start)} → {formatDate(l.end)}
                    </Td>
                    <Td>{l.type}</Td>
                    <Td className="max-w-xs whitespace-normal">{l.reason}</Td>
                    <Td>
                      <StatusBadge status={l.status === "PENDING" ? "Pending" : l.status === "APPROVED" ? "Approved" : "Declined"} />
                    </Td>
                    <Td className="max-w-xs whitespace-normal text-muted">{l.review ?? "—"}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "reconciliation" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title="Reconciliation request" description="Pick every date where your ERP attendance is wrong and explain the problem.">
            <div className="space-y-4">
              {reconError && (
                <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {reconError}
                </p>
              )}
              <DateMultiPicker selected={dates} onChange={setDates} max={today} />
              <div>
                <p className="mb-1 text-sm font-medium">Selected dates ({dates.length})</p>
                {dates.length === 0 ? (
                  <p className="text-xs text-muted">No dates selected yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {dates.map((d) => (
                      <li key={d}>
                        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100" aria-label={`Remove ${dmy(d)}`} onClick={() => setDates(dates.filter((x) => x !== d))}>
                          {dmy(d)} <X className="h-3 w-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <Field label="What is wrong?" htmlFor="rcr" required hint="Briefly explain the problem or wrong information.">
                <Textarea id="rcr" value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button className="w-full" onClick={submitRecon}>
                Submit request
              </Button>
            </div>
          </Card>
          <Card className="lg:col-span-2" title="My reconciliation requests">
            {myRecon.length === 0 ? (
              <p className="text-sm text-muted">No reconciliation requests yet.</p>
            ) : (
              <Table head={["Dates", "What is wrong", "Requested", "Status"]}>
                {myRecon.map((r) => {
                  const ds = reconDates(r.recordRef);
                  return (
                    <tr key={r.id}>
                      <Td className="max-w-xs whitespace-normal">
                        {ds ? (
                          <span className="flex flex-wrap gap-1">
                            {ds.map((d) => (
                              <Badge key={d}>{dmy(d)}</Badge>
                            ))}
                          </span>
                        ) : (
                          r.recordRef
                        )}
                      </Td>
                      <Td className="max-w-sm whitespace-normal">{r.reason}</Td>
                      <Td>{formatDateTime(r.createdAt)}</Td>
                      <Td>
                        <StatusBadge status={r.status === "OPEN" ? "Pending" : "Resolved"} />
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
