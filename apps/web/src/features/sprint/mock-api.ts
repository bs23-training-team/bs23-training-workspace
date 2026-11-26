"use client";

import { type DB, type DSColumn, type SprintTask, type TaskVerification, type DSCell } from "@/lib/mock/types";
import { uid, todayISO, nowHHMM, weekStartOf, addDays } from "@/lib/utils";
import { nameOf, inScope, traineeOf } from "@/lib/mock/selectors";
import { nowIso, Result, fail, ok, notify } from "@/lib/mock/core";
import { mutate, getDB } from "@/lib/mock/store";
import { addXp, runBadgeRules } from "@/features/gamification-core/mock-api";


export function weekIdFor(teamId: string, weekStart: string) {
  return `sw-${teamId}-${weekStart}`;
}

export function dsCell(db: DB, weekId: string, traineeUserId: string, date: string, column: DSColumn) {
  return db.dsCells.find((c) => c.id === `${weekId}|${traineeUserId}|${date}|${column}`);
}

export function validateTask(t: Pick<SprintTask, "title" | "plannedStart" | "plannedEnd" | "plannedHours" | "actualHours">): string | null {
  if (!t.title.trim()) return "Task title is required.";
  if (t.plannedStart && t.plannedEnd && t.plannedEnd <= t.plannedStart) return "Planned end must be after planned start.";
  if (t.plannedHours < 0 || t.actualHours < 0) return "Hours cannot be negative.";
  return null;
}

/** Queues the approval-request email to the RND team / SBU a task was logged for. */
function requestOwnerApproval(d: DB, task: SprintTask, owner: { name: string; email: string }) {
  d.emailDeliveries.unshift({
    id: uid("em"),
    taskId: task.id,
    recipient: owner.email,
    subject: `Approval request: ${nameOf(d, task.traineeUserId)} created the task "${task.title.trim()}" for ${owner.name}`,
    // Provider is not connected in this build: delivery is recorded as failed with retry.
    status: d.integrations.find((x) => x.key === "EMAIL")?.status === "Connected" ? "ACCEPTED" : "FAILED",
    attempts: 1,
    createdAt: nowIso(),
  });
}

/**
 * Saves a sprint task. A task created for an RND team or SBU is added to the sprint at once with status
 * PENDING and an approval-request email goes to that owner; the PM hears back when the owner replies
 * (or, if there is no reply after a day, via `alertStaleOwnerApprovals`). Changing the task's title,
 * description, category or owner sends a new request.
 */
export function saveTask(task: SprintTask): Result {
  const err = validateTask(task);
  if (err) return fail(err);
  mutate((d) => {
    const i = d.sprintTasks.findIndex((x) => x.id === task.id);
    const prev = i >= 0 ? d.sprintTasks[i] : undefined;
    const owner = task.ownerId ? d.taskOwners.find((o) => o.id === task.ownerId) : undefined;
    const changed = !prev || prev.ownerId !== task.ownerId || prev.title !== task.title || prev.description !== task.description || prev.category !== task.category;
    let next: SprintTask = task;
    if (!owner) next = { ...task, verification: undefined, ownerRequestedAt: undefined, pendingAlertSent: undefined };
    else if (changed) next = { ...task, verification: "PENDING", ownerRequestedAt: nowIso(), pendingAlertSent: false };
    else next = { ...task, verification: prev?.verification, ownerRequestedAt: prev?.ownerRequestedAt, pendingAlertSent: prev?.pendingAlertSent };
    if (i >= 0) d.sprintTasks[i] = next;
    else d.sprintTasks.push(next);
    if (owner && changed) requestOwnerApproval(d, next, owner);
  });
  return ok();
}

/** Stand-in for the owner's reply to the approval email (the real reply arrives through the RND/SBU API). */
export function verifyTaskOwner(pmId: string, taskId: string, status: Exclude<TaskVerification, "PENDING">): Result {
  const task = getDB().sprintTasks.find((x) => x.id === taskId);
  if (!task || !task.ownerId) return fail("This task has no owner to approve it.");
  if (!inScope(getDB(), pmId, task.traineeUserId)) return fail("This user is not in your scope.");
  if (task.verification !== "PENDING") return fail("The owner has already replied about this task.");
  mutate((d) => {
    const x = d.sprintTasks.find((y) => y.id === taskId)!;
    const owner = d.taskOwners.find((o) => o.id === x.ownerId);
    x.verification = status;
    const approved = status === "VERIFIED";
    const t = traineeOf(d, x.traineeUserId);
    const link = "/pm/trainees/" + x.traineeUserId;
    notify(d, t?.pmId ?? pmId, "Sprint awaiting review", approved ? "Task approved by owner" : "Task declined by owner", `${owner?.name ?? "Owner"} ${approved ? "approved" : "declined"} "${x.title}" (${nameOf(d, x.traineeUserId)}).`, link);
    if (!approved) notify(d, x.traineeUserId, "Sprint awaiting review", "Task declined", `${owner?.name ?? "The owner"} declined "${x.title}". Check with them or update the task.`, "/trainee/daily-sprint");
  });
  return ok();
}

const DAY_MS = 24 * 60 * 60 * 1000;

const staleApproval = (t: SprintTask) => t.verification === "PENDING" && !!t.ownerRequestedAt && Date.now() - Date.parse(t.ownerRequestedAt) >= DAY_MS;

/** Tasks whose owner has not replied for a day or more. */
export function staleApprovalTasks(db: DB) {
  return db.sprintTasks.filter(staleApproval);
}

/** Tells each PM once about tasks that are still awaiting an owner's approval after a day. */
export function alertStaleOwnerApprovals(): number {
  const pending = getDB().sprintTasks.filter((t) => staleApproval(t) && !t.pendingAlertSent);
  if (!pending.length) return 0;
  mutate((d) => {
    for (const x of d.sprintTasks.filter((t) => staleApproval(t) && !t.pendingAlertSent)) {
      x.pendingAlertSent = true;
      const t = traineeOf(d, x.traineeUserId);
      const owner = d.taskOwners.find((o) => o.id === x.ownerId);
      if (t) notify(d, t.pmId, "Sprint awaiting review", "Task approval still pending", `${owner?.name ?? "The owner"} has not replied about "${x.title}" (${nameOf(d, x.traineeUserId)}) for over a day.`, "/pm/trainees/" + x.traineeUserId);
    }
  });
  return pending.length;
}

export function deleteTask(id: string) {
  mutate((d) => {
    d.sprintTasks = d.sprintTasks.filter((t) => t.id !== id);
  });
}

/** Incomplete tasks from the last working day carry forward to today (FR-DS-03). */
export function carryForward(traineeUserId: string) {
  const db = getDB();
  const today = todayISO();
  if (db.sprintTasks.some((t) => t.traineeUserId === traineeUserId && t.date === today && t.carriedFrom)) return;
  const prevDates = [...new Set(db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date < today).map((t) => t.date))].sort();
  const last = prevDates[prevDates.length - 1];
  if (!last) return;
  const open = db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date === last && !t.done);
  if (!open.length) return;
  mutate((d) => {
    for (const t of open) {
      if (d.sprintTasks.some((x) => x.traineeUserId === traineeUserId && x.date === today && x.carriedFrom === t.id)) continue;
      d.sprintTasks.push({ ...t, id: uid("st"), date: today, actualHours: 0, done: false, carriedFrom: t.id });
    }
  });
}

export function submitSprint(traineeUserId: string): Result<{ onTime: boolean }> {
  const db = getDB();
  const today = todayISO();
  if (db.sprintSubmissions.some((s) => s.traineeUserId === traineeUserId && s.date === today)) return fail("Today's sprint is already recorded");
  const tasks = db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date === today);
  if (!tasks.length) return fail("Add your own sprint task before submitting");
  const onTime = nowHHMM() <= db.xpRules.sprintCutoff;
  const t = traineeOf(db, traineeUserId);
  mutate((d) => {
    d.sprintSubmissions.push({ traineeUserId, date: today, time: nowIso(), onTime });
    runBadgeRules(d, traineeUserId);
    // Sprint XP stays pending until PM verification; late submissions earn no on-time XP.
    if (onTime) addXp(d, { traineeUserId, source: "On-time sprint", amount: d.xpRules.onTimeSprint, status: "PENDING", key: `sprint:${traineeUserId}:${today}`, evidence: `Sprint submitted ${nowHHMM()}`, date: today });
    // Write into the team DS sheet for the current week.
    const ws = weekStartOf(today);
    for (const teamId of t?.teamIds ?? []) {
      const weekId = weekIdFor(teamId, ws);
      if (!d.sprintWeeks.some((w) => w.id === weekId)) continue;
      const prevDay = [...new Set(d.sprintTasks.filter((x) => x.traineeUserId === traineeUserId && x.date < today).map((x) => x.date))].sort().pop();
      const put = (column: DSColumn, value: string) => {
        if (!value) return;
        const id = `${weekId}|${traineeUserId}|${today}|${column}`;
        if (d.dsCells.some((c) => c.id === id)) return;
        d.dsCells.push({ id, weekId, traineeUserId, date: today, column, value, authorId: traineeUserId, createdAt: nowIso(), updatedBy: traineeUserId, updatedAt: nowIso(), history: [] });
      };
      put("YESTERDAY", d.sprintTasks.filter((x) => x.traineeUserId === traineeUserId && x.date === prevDay && x.done).map((x) => x.title).join("; "));
      put("HOURS", String(tasks.reduce((s, x) => s + x.plannedHours, 0)));
      put("TODAY", tasks.map((x) => x.title).join("; "));
      put("BLOCKERS", tasks.map((x) => x.blocker).filter(Boolean).join("; "));
    }
    const blockers = tasks.filter((x) => x.blocker);
    if (t && blockers.length) notify(d, t.pmId, "Sprint awaiting review", "Sprint blocker", `${nameOf(d, traineeUserId)} reported: ${blockers[0].blocker}`, "/pm/daily-sprints");
  });
  return ok({ onTime });
}

export function addSprintWeek(pmId: string, teamId: string): Result<string> {
  const db = getDB();
  const weeks = db.sprintWeeks.filter((w) => w.teamId === teamId).map((w) => w.weekStart).sort();
  const next = weeks.length ? addDays(weeks[weeks.length - 1], 7) : weekStartOf(todayISO());
  mutate((d) => {
    d.sprintWeeks.push({ id: weekIdFor(teamId, next), teamId, weekStart: next });
  });
  return ok(next);
}

/**
 * Save a DS cell with optimistic locking (SRS §4). `baseUpdatedAt` is what the editor
 * last saw; if the cell changed since, a conflict is returned for the dialog.
 */
export function saveDSCell(
  editorId: string,
  weekId: string,
  traineeUserId: string,
  date: string,
  column: DSColumn,
  value: string,
  baseUpdatedAt?: string,
): { ok: true } | { ok: false; conflict: DSCell } {
  const existing = dsCell(getDB(), weekId, traineeUserId, date, column);
  if (existing && baseUpdatedAt && existing.updatedAt !== baseUpdatedAt) return { ok: false, conflict: existing };
  mutate((d) => {
    const id = `${weekId}|${traineeUserId}|${date}|${column}`;
    const c = d.dsCells.find((x) => x.id === id);
    if (c) {
      if (c.value === value) return;
      c.history.push({ value: c.value, by: c.updatedBy, at: c.updatedAt });
      c.value = value;
      c.updatedBy = editorId;
      c.updatedAt = nowIso();
    } else if (value) {
      d.dsCells.push({ id, weekId, traineeUserId, date, column, value, authorId: editorId, createdAt: nowIso(), updatedBy: editorId, updatedAt: nowIso(), history: [] });
    }
  });
  return { ok: true };
}

/** Demo helper: simulate the trainee editing the same cell to show the conflict dialog. */
export function simulateTraineeEdit(weekId: string, traineeUserId: string, date: string, column: DSColumn, value: string) {
  saveDSCell(traineeUserId, weekId, traineeUserId, date, column, value);
}
