"use client";

import { type LeaveRequest, type AttendanceRecord, type IntegrationKey } from "@/lib/mock/types";
import { Result, fail, notify, ok, nowIso } from "@/lib/mock/core";
import { traineeOf, nameOf, inScope } from "@/lib/mock/selectors";
import { getDB, mutate } from "@/lib/mock/store";
import { uid, todayISO } from "@/lib/utils";


export function requestLeave(traineeUserId: string, input: { start: string; end: string; type: LeaveRequest["type"]; reason: string }): Result {
  if (!input.start || !input.end) return fail("Choose a start and end date.");
  if (input.end < input.start) return fail("End date cannot precede start date");
  if (!input.reason.trim()) return fail("Give a reason for your leave.");
  const t = traineeOf(getDB(), traineeUserId);
  mutate((d) => {
    d.leaveRequests.unshift({ id: uid("lr"), traineeUserId, ...input, reason: input.reason.trim(), status: "PENDING", createdAt: todayISO() });
    if (t) notify(d, t.pmId, "Leave request", "New leave request", `${nameOf(d, traineeUserId)} requested leave ${input.start} → ${input.end}.`, "/pm/attendance");
  });
  return ok();
}

export function decideLeave(pmId: string, id: string, approve: boolean, note: string): Result {
  if (!note.trim()) return fail("A note is required for the decision.");
  const db = getDB();
  const req = db.leaveRequests.find((x) => x.id === id);
  if (!req) return fail("This leave request no longer exists.");
  if (!inScope(db, pmId, req.traineeUserId)) return fail("This user is not in your scope.");
  if (req.status !== "PENDING") return fail("This leave request was already decided.");
  mutate((d) => {
    const l = d.leaveRequests.find((x) => x.id === id)!;
    l.status = approve ? "APPROVED" : "DECLINED";
    l.review = note.trim();
    l.reviewerId = pmId;
    l.reviewedAt = nowIso();
    notify(d, l.traineeUserId, "Leave decided", `Leave ${approve ? "approved" : "declined"}`, `${l.start} → ${l.end}: ${note.trim()}`, "/trainee/erp");
  });
  return ok();
}

export function addManualAttendance(pmId: string, input: Omit<AttendanceRecord, "id" | "source" | "syncedAt" | "hours" | "lateMinutes">): Result {
  if (!input.traineeUserId || !input.date || !input.entry) return fail("User, date and entry time are required.");
  if (!inScope(getDB(), pmId, input.traineeUserId)) return fail("This user is not in your scope.");
  if (input.exit && input.exit <= input.entry) return fail("Exit must be after entry.");
  if (getDB().attendance.some((a) => a.traineeUserId === input.traineeUserId && a.date === input.date)) return fail("A record already exists for this date. Use a reconciliation request instead.");
  const [eh, em] = input.entry.split(":").map(Number);
  const late = Math.max(0, eh * 60 + em - 9 * 60);
  let hours: number | undefined;
  if (input.exit) {
    const [xh, xm] = input.exit.split(":").map(Number);
    hours = Math.round(((xh * 60 + xm - (eh * 60 + em)) / 60) * 10) / 10;
  }
  mutate((d) => {
    d.attendance.push({ id: uid("ar"), ...input, exit: input.exit || undefined, lateMinutes: late, hours, source: "PM_ENTERED", syncedAt: nowIso() });
  });
  return ok();
}

export function requestReconciliation(traineeUserId: string, recordRef: string, reason: string): Result {
  if (!reason.trim()) return fail("Give a reason for the correction.");
  mutate((d) => {
    d.reconciliations.unshift({ id: uid("rc"), traineeUserId, recordRef, reason: reason.trim(), status: "OPEN", createdAt: nowIso() });
  });
  return ok();
}

export function resolveReconciliation(pmId: string, id: string): Result {
  const db = getDB();
  const rec = db.reconciliations.find((x) => x.id === id);
  if (!rec) return fail("This request no longer exists.");
  if (!inScope(db, pmId, rec.traineeUserId)) return fail("This user is not in your scope.");
  if (rec.status === "RESOLVED") return fail("This request is already resolved.");
  mutate((d) => {
    const r = d.reconciliations.find((x) => x.id === id)!;
    r.status = "RESOLVED";
  });
  return ok();
}

export function mapTeamsIdentity(pmId: string, recordId: string, traineeUserId: string): Result {
  const db = getDB();
  const rec = db.meetingAttendance.find((x) => x.id === recordId);
  if (!rec) return fail("This meeting record no longer exists.");
  if (rec.status !== "UNMAPPED") return fail("This identity is already mapped.");
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  mutate((d) => {
    const m = d.meetingAttendance.find((x) => x.id === recordId)!;
    m.traineeUserId = traineeUserId;
    m.status = "ATTENDED";
  });
  return ok();
}

/** Mock retry: integrations stay unavailable until real credentials exist on the server. */
export function retryIntegration(key: IntegrationKey) {
  mutate((d) => {
    const i = d.integrations.find((x) => x.key === key)!;
    if (i.status === "Disconnected" || i.status === "Authorization required") return;
    i.status = "Failed — retry available";
  });
}
