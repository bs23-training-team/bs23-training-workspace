"use client";

import { Result, fail, nowIso, ok } from "@/lib/mock/core";
import { archiveExpiredTrainees } from "@/features/directory/api";
import { getDB, mutate } from "@/lib/mock/store";
import { uid, isEmail } from "@/lib/utils";
import { userById } from "@/lib/mock/selectors";
import { latestEvaluation } from "@/features/assessment/api";


export function login(identity: string, password: string, remember: boolean): Result<{ redirect: string }> {
  archiveExpiredTrainees(); // a departure date that has passed makes the account inactive before sign-in
  const db = getDB();
  const id = identity.trim().toLowerCase();
  const t = db.trainees.find((x) => x.traineeId.toLowerCase() === id);
  const u = db.users.find((x) => x.email.toLowerCase() === id || x.id === t?.userId || x.pmCode?.toLowerCase() === id);
  if (!u || u.password !== password) return fail("The login details are incorrect.");
  if (u.role === "PM" && !u.emailVerified) return fail("Verify your email before signing in. Open the link we sent to your work email.");
  if (db.trainees.some((x) => x.userId === u.id && x.archivedAt)) return fail("This account is inactive. Ask your PM to activate it.");
  const sessionId = uid("s");
  mutate((d) => {
    d.currentUserId = u.id;
    d.currentSessionId = sessionId;
    d.sessions.push({
      id: sessionId,
      userId: u.id,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      device: `${typeof navigator !== "undefined" ? navigator.userAgent.split(")")[0].split("(")[1] ?? "Browser" : "Browser"}${remember ? " · remembered" : ""}`,
    });
  });
  return ok({ redirect: homeFor(u.id) });
}

export function homeFor(userId: string) {
  const db = getDB();
  const u = userById(db, userId);
  if (!u) return "/login";
  if (u.role === "PM") return "/pm/dashboard";
  if (u.mustChangePassword) return "/change-password";
  if (!latestEvaluation(db, u.id)) return "/trainee/onboarding";
  return "/trainee/dashboard";
}

export function logout() {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== d.currentSessionId);
    d.currentUserId = null;
    d.currentSessionId = null;
  });
}

export function registerPM(input: { name: string; email: string; password: string; confirm: string }): Result<{ token: string }> {
  const db = getDB();
  if (!input.name.trim()) return fail("Enter your full name.");
  if (!isEmail(input.email)) return fail("Enter a valid work email.");
  if (input.password.length < 8) return fail("Password must be at least 8 characters.");
  if (input.password !== input.confirm) return fail("Passwords do not match.");
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const id = uid("pm");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "PM", password: input.password, mustChangePassword: false, emailVerified: false, createdAt: nowIso() });
    d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: id, showInBell: true })));
  });
  return ok({ token: verificationToken(input.email.trim()) });
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Mock signed link token. The real backend issues a random, single-use token and emails it. */
export function verificationToken(email: string) {
  return btoa(`verify|${email}|${Date.now()}`);
}

/** Verifies a PM's email from the link token; a bad or expired token gives a clear message (FR-AUTH-04). */
export function verifyEmail(token: string): Result<{ email: string }> {
  let email = "";
  let issued = 0;
  try {
    const [kind, e, t] = atob(token).split("|");
    if (kind !== "verify") throw new Error("bad token");
    [email, issued] = [e, Number(t)];
  } catch {
    return fail("This verification link is invalid. Open the link from your email again.");
  }
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!u || !issued) return fail("This verification link is invalid. Open the link from your email again.");
  if (u.emailVerified) return ok({ email: u.email });
  if (Date.now() - issued > VERIFY_TTL_MS) return fail("This verification link has expired. Send yourself a new one below.");
  mutate((d) => {
    d.users.find((x) => x.id === u.id)!.emailVerified = true;
  });
  return ok({ email: u.email });
}

/** Always returns ok so the UI never reveals whether an email exists. */
export function requestPasswordReset(email: string): Result<{ token?: string }> {
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  return ok({ token: u ? btoa(`${u.email}|${Date.now()}`) : undefined });
}

export function resetPassword(token: string, password: string, confirm: string): Result {
  let email = "";
  let issued = 0;
  try {
    [email, issued] = (() => {
      const [e, t] = atob(token).split("|");
      return [e, Number(t)] as [string, number];
    })();
  } catch {
    return fail("This reset link is invalid.");
  }
  if (!email || Date.now() - issued > 30 * 60 * 1000) return fail("This reset link has expired. Request a new one.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  if (password !== confirm) return fail("Passwords do not match.");
  mutate((d) => {
    const u = d.users.find((x) => x.email === email);
    if (u) u.password = password;
  });
  return ok();
}

export function changePassword(userId: string, current: string, next: string, confirm: string): Result {
  const u = userById(getDB(), userId);
  if (!u) return fail("Not signed in.");
  if (u.password !== current) return fail("Current password is incorrect.");
  if (next.length < 8) return fail("Password must be at least 8 characters.");
  if (next !== confirm) return fail("Passwords do not match.");
  if (next === current) return fail("Choose a password different from the current one.");
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    x.password = next;
    x.mustChangePassword = false;
  });
  return ok();
}

export function endSession(sessionId: string) {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== sessionId);
  });
}

export function updateProfile(userId: string, input: { name: string; bio: string }): Result {
  if (!input.name.trim()) return fail("Display name cannot be empty.");
  mutate((d) => {
    const u = d.users.find((x) => x.id === userId)!;
    u.name = input.name.trim();
    u.bio = input.bio.trim();
  });
  return ok();
}

export function validatePhoto(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return "Choose a JPG, PNG or WebP image under 2 MB.";
  return null;
}

export function setPhoto(userId: string, dataUrl: string | undefined) {
  mutate((d) => {
    d.users.find((x) => x.id === userId)!.photoUrl = dataUrl;
  });
}
