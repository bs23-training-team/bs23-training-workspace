"use client";

import { type Position, type AttendanceMode, type Resource } from "@/lib/mock/types";
import { Result, fail, nowIso, ok } from "@/lib/mock/core";
import { getDB, mutate } from "@/lib/mock/store";
import { isEmail, uid, todayISO } from "@/lib/utils";


export interface TraineeInput {
  traineeId: string;
  name: string;
  email: string;
  tempPassword?: string;
  position: Position;
  attendanceMode: AttendanceMode;
  resource: Resource;
  onboardDate: string;
  /** Departure date (ISO). Empty is allowed only for a reactivated user whose date is not set yet. */
  periodEnd: string;
  /** Time (minutes) and total marks for the first-login skill assessment. */
  skillAssessmentMinutes: number;
  skillAssessmentMarks: number;
  teamIds: string[];
}

export function assessmentSettingsError(input: Pick<TraineeInput, "skillAssessmentMinutes" | "skillAssessmentMarks">): string | null {
  if (!Number.isInteger(input.skillAssessmentMinutes) || input.skillAssessmentMinutes < 1 || input.skillAssessmentMinutes > 180) return "Skill assessment time must be a whole number of minutes (1–180).";
  if (!Number.isInteger(input.skillAssessmentMarks) || input.skillAssessmentMarks < 1 || input.skillAssessmentMarks > 1000) return "Skill assessment marks must be a whole number (1–1000).";
  return null;
}

export function createTrainee(pmId: string, input: TraineeInput): Result {
  const db = getDB();
  if (!input.traineeId.trim() || !input.name.trim() || !input.email.trim() || !input.onboardDate) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (!input.tempPassword || input.tempPassword.length < 8) return fail("Temporary password must be at least 8 characters.");
  if (!input.teamIds.length) return fail("Choose at least one team.");
  const settingsError = assessmentSettingsError(input);
  if (settingsError) return fail(settingsError);
  if (!input.periodEnd) return fail("Choose a departure date.");
  if (input.periodEnd <= input.onboardDate) return fail("The departure date must be after the onboarding date.");
  if (db.trainees.some((t) => t.traineeId.toLowerCase() === input.traineeId.trim().toLowerCase())) return fail("A user with this ID already exists.");
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const id = uid("u");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "TRAINEE", password: input.tempPassword!, mustChangePassword: true, emailVerified: true, createdAt: nowIso() });
    d.trainees.push({ userId: id, traineeId: input.traineeId.trim().toUpperCase(), position: input.position, attendanceMode: input.attendanceMode, resource: input.resource, onboardDate: input.onboardDate, periodEnd: input.periodEnd, skillAssessmentMinutes: input.skillAssessmentMinutes, skillAssessmentMarks: input.skillAssessmentMarks, skills: [], teamIds: input.teamIds, pmId, hideFromLeaderboard: false });
  });
  return ok();
}

export function updateTrainee(pmId: string, userId: string, input: TraineeInput): Result {
  const db = getDB();
  if (!input.name.trim() || !input.email.trim() || !input.onboardDate) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (!input.teamIds.length) return fail("Choose at least one team.");
  const cur = db.trainees.find((t) => t.userId === userId);
  const settingsErr = assessmentSettingsError(input);
  if (settingsErr) return fail(settingsErr);
  if (cur?.archivedAt && (!input.periodEnd || input.periodEnd <= todayISO())) return fail("Set a new departure date after today to move this user back to All Users.");
  if (!input.periodEnd) {
    if (cur?.periodEnd) return fail("Choose a departure date.");
  } else {
    if (input.periodEnd <= input.onboardDate) return fail("The departure date must be after the onboarding date.");
    if (cur && cur.periodEnd !== input.periodEnd && input.periodEnd <= todayISO()) return fail("The departure date has already passed. Choose a date after today.");
  }
  if (db.trainees.some((t) => t.userId !== userId && t.traineeId.toLowerCase() === input.traineeId.trim().toLowerCase())) return fail("A user with this ID already exists.");
  if (db.users.some((u) => u.id !== userId && u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const u = d.users.find((x) => x.id === userId)!;
    const t = d.trainees.find((x) => x.userId === userId)!;
    const wasArchived = !!t.archivedAt;
    u.name = input.name.trim();
    u.email = input.email.trim();
    if (input.tempPassword) {
      u.password = input.tempPassword;
      u.mustChangePassword = true;
    }
    Object.assign(t, { traineeId: input.traineeId.trim().toUpperCase(), position: input.position, attendanceMode: input.attendanceMode, resource: input.resource, onboardDate: input.onboardDate, periodEnd: input.periodEnd, skillAssessmentMinutes: input.skillAssessmentMinutes, skillAssessmentMarks: input.skillAssessmentMarks, teamIds: input.teamIds });
    if (wasArchived) {
      t.archivedAt = undefined; // a new departure date reactivates the user
    }
  });
  return ok();
}

/** Moves every active trainee whose period has ended to the Archive. Returns how many were archived. */
export function archiveExpiredTrainees(): number {
  const today = todayISO();
  // An empty periodEnd means no end date is set (reactivated user): never auto-archived.
  const expired = (t: { archivedAt?: string; periodEnd: string }) => !t.archivedAt && !!t.periodEnd && t.periodEnd <= today;
  if (!getDB().trainees.some(expired)) return 0;
  let n = 0;
  mutate((d) => {
    for (const t of d.trainees) {
      if (!expired(t)) continue;
      t.archivedAt = today;
      n++;
    }
    d.sessions = d.sessions.filter((s) => !d.trainees.some((t) => t.userId === s.userId && t.archivedAt));
  });
  return n;
}

export function createPM(creatorId: string, input: { name: string; email: string; pmCode: string; password: string }): Result {
  const db = getDB();
  if (!input.name.trim() || !input.pmCode.trim()) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (input.password.length < 8) return fail("Password must be at least 8 characters.");
  const code = input.pmCode.trim().toUpperCase();
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  if (db.users.some((u) => u.pmCode?.toLowerCase() === code.toLowerCase()) || db.trainees.some((t) => t.traineeId.toLowerCase() === code.toLowerCase())) return fail("This ID is already in use.");
  mutate((d) => {
    const id = uid("pm");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "PM", pmCode: code, password: input.password, mustChangePassword: true, emailVerified: true, createdAt: nowIso() });
    d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: id, showInBell: true })));
  });
  return ok();
}

export function createTeam(pmId: string, name: string): Result {
  if (!name.trim()) return fail("Enter a team name.");
  if (getDB().teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return fail("A team with this name already exists.");
  mutate((d) => {
    d.teams.push({ id: uid("t"), name: name.trim(), pmId });
  });
  return ok();
}

export function saveFeedback(pmId: string, traineeUserId: string, text: string): Result {
  if (!text.trim()) return fail("Feedback cannot be empty.");
  mutate((d) => {
    const prev = d.feedback.filter((f) => f.traineeUserId === traineeUserId).sort((a, b) => b.version - a.version)[0];
    d.feedback.push({ id: uid("f"), traineeUserId, authorId: pmId, text: text.trim(), version: (prev?.version ?? 0) + 1, createdAt: nowIso() });
  });
  return ok();
}

export function retryEmail(id: string) {
  mutate((d) => {
    const e = d.emailDeliveries.find((x) => x.id === id)!;
    e.attempts += 1;
    e.status = d.integrations.find((i) => i.key === "EMAIL")?.status === "Connected" ? "ACCEPTED" : "FAILED";
  });
}
