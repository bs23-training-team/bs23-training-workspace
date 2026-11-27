"use client";

// Real API client for the auth feature (E01): sign-in, sign-out, who is signed in, and passwords.
// Same shape as ./mock-api (`Result`), but async. Routes: apps/api/src/modules/identity/identity.controller.ts.
//
// WHO IS SIGNED IN is decided here, by the API: `restoreSession()` asks `GET /auth/me` with the saved tokens, and
// the shell (`useApiSession`) waits for the answer. The mock store is never trusted for that.
//
// COMPATIBILITY MIRROR (temporary): the dashboards and every other module that is not connected yet still read
// "the current user" and their own mock records from the mock store (`currentUser(db)`, `traineeOf(db, id)`). So
// the API's user is COPIED into that store after every sign-in and every page load. It is a read-only copy: the
// API is the truth, and it is overwritten each time. Delete it when the last mock module is connected.

import { useEffect, useSyncExternalStore } from "react";
import { ApiError, clearTokens, hasTokens, onSessionEnded, request, setTokens } from "@/lib/api-client";
import { fail, nowIso, ok, type Result } from "@/lib/mock/core";
import { mutate } from "@/lib/mock/store";
import type { AttendanceMode, DB, Position, Resource, Trainee } from "@/lib/mock/types";

/** What `POST /auth/login`, `/auth/refresh` and `GET /auth/me` return as `user`. */
export type ApiUser = {
  id: string;
  name: string;
  email: string;
  role: "PM" | "USER";
  workspaceId: string;
  mustChangePassword: boolean;
  /** Users only. */
  resource?: Resource;
  /** Users only, and only from `GET /auth/me`: the managing PM. */
  pmId?: string;
};

/** The part of E02's `GET /directory/me` that the mock screens need (packages/contracts/src/directory/me.ts). */
type OwnProfile = {
  bio: string | null;
  position: Position;
  attendanceMode: AttendanceMode;
  onboardDate: string;
  teams: { id: string; name: string }[];
};

type LoginResponse = { accessToken: string; refreshToken: string; user: ApiUser };

export type SessionState = "checking" | "signed-in" | "signed-out";

// The answer to "is someone signed in?" is ONE value for the whole app. It must not live in a component's state:
// Next.js keeps visited pages (with their state) and shows them again, so a stale "signed-out" would survive.
let session: SessionState = "checking";
const watchers = new Set<() => void>();

function setSession(next: SessionState) {
  if (next === session) return;
  session = next;
  watchers.forEach((watcher) => watcher());
}

function watchSession(watcher: () => void) {
  watchers.add(watcher);
  return () => void watchers.delete(watcher);
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

// ----- The compatibility mirror -----

/** A user's trainee record in the mock store. The defaults only stand until `GET /directory/me` has answered. */
function mirrorTrainee(d: DB, u: ApiUser, profile?: OwnProfile) {
  let t: Trainee | undefined = d.trainees.find((x) => x.userId === u.id);
  if (!t) {
    t = { userId: u.id, traineeId: u.id, position: "FULLSTACK", attendanceMode: "PHYSICAL", resource: "TRAINEE", onboardDate: nowIso().slice(0, 10), periodEnd: "", skills: [], teamIds: [], pmId: "", hideFromLeaderboard: false };
    d.trainees.push(t);
  }
  if (u.resource) t.resource = u.resource;
  if (u.pmId) t.pmId = u.pmId;
  if (!profile) return;
  t.position = profile.position;
  t.attendanceMode = profile.attendanceMode;
  t.onboardDate = profile.onboardDate;
  t.teamIds = profile.teams.map((team) => team.id);
  for (const team of profile.teams) if (!d.teams.some((x) => x.id === team.id)) d.teams.push({ id: team.id, name: team.name, pmId: t.pmId });
}

/** Copy the API's user into the mock store and make it the current user. Overwrites what is there. */
function syncMockUser(u: ApiUser, profile?: OwnProfile) {
  mutate((d) => {
    const role = u.role === "PM" ? ("PM" as const) : ("TRAINEE" as const); // the web's own two-role model
    const row = { id: u.id, email: u.email, name: u.name, role, mustChangePassword: u.mustChangePassword, emailVerified: true, ...(u.role === "PM" ? { pmCode: u.id } : {}), ...(profile ? { bio: profile.bio ?? "" } : {}) };
    const i = d.users.findIndex((x) => x.id === u.id);
    if (i >= 0) d.users[i] = { ...d.users[i], ...row };
    else d.users.push({ ...row, password: "", createdAt: nowIso() });
    if (u.role === "USER") mirrorTrainee(d, u, profile);
    else if (!d.notificationPrefs.some((p) => p.userId === u.id)) {
      d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: u.id, showInBell: true })));
    }
    const sessionId = `api-${u.id}`;
    if (!d.sessions.some((s) => s.id === sessionId)) d.sessions.push({ id: sessionId, userId: u.id, createdAt: nowIso(), lastSeenAt: nowIso(), device: "This browser" });
    d.currentUserId = u.id;
    d.currentSessionId = sessionId;
  });
}

function signOutMock() {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== d.currentSessionId);
    d.currentUserId = null;
    d.currentSessionId = null;
  });
}

/**
 * Asks the API for the signed-in account and refreshes the mirror. For a user it also reads their own profile;
 * that read is optional (the API refuses it until a temporary password has been changed).
 */
async function refreshMirror() {
  const { user } = await request<{ user: ApiUser }>("/auth/me");
  let profile: OwnProfile | undefined;
  if (user.role === "USER" && !user.mustChangePassword) {
    try {
      profile = await request<OwnProfile>("/directory/me");
    } catch {
      /* the mirror keeps what it already has */
    }
  }
  if (hasTokens()) syncMockUser(user, profile); // not if the person signed out while we waited
}

// ----- Sign in and out -----

/** `identifier` is the PM's email or the user's ID (the API decides which table to look in). */
export async function login(identifier: string, password: string, remember: boolean): Promise<Result<{ userId: string }>> {
  try {
    const r = await request<LoginResponse>("/auth/login", { method: "POST", auth: false, body: { identifier: identifier.trim(), password, rememberMe: remember } });
    setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    syncMockUser(r.user);
    setSession("signed-in"); // the API has just answered for these tokens
    try {
      await refreshMirror(); // the login answer has no managing PM or profile
    } catch {
      /* signed in all the same: the next page load asks again */
    }
    return ok({ userId: r.user.id });
  } catch (e) {
    return fail(errorText(e));
  }
}

/** Ends the session on the server, then forgets the tokens and the mock sign-in. */
export async function logout() {
  try {
    if (hasTokens()) await request("/auth/logout", { method: "POST" });
  } catch {
    /* the session may already be over: sign out locally anyway */
  }
  clearTokens();
  signOutMock();
  setSession("signed-out");
}

// ----- Who is signed in: the API decides (GET /auth/me), the shell waits for it -----

/**
 * Asks the API who the saved tokens belong to.
 * - "signed-in": the API knows them (the mirror is refreshed, so a changed name or forced password change shows).
 * - "signed-out": no tokens, or the API ended the session (it was revoked or the account was archived).
 * - "unavailable": the API could not answer. The person is NOT signed out for that.
 */
async function askApi(): Promise<"signed-in" | "signed-out" | "unavailable"> {
  if (!hasTokens()) return "signed-out";
  try {
    await refreshMirror();
    return hasTokens() ? "signed-in" : "signed-out";
  } catch (e) {
    // The API client forgets the tokens only when the API refuses to renew them. A 401 with the tokens still
    // there means the renewal could not be answered.
    return e instanceof ApiError && e.status === 401 && !hasTokens() ? "signed-out" : "unavailable";
  }
}

let asking: Promise<void> | null = null;

/** Asks once, however many components wait. "unavailable" does NOT sign the person out. */
function restoreSession() {
  asking ??= askApi()
    .then((answer) => {
      if (answer === "signed-out") signOutMock();
      setSession(answer === "signed-out" ? "signed-out" : "signed-in");
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}

// The API ended the session while the person was on a page.
if (typeof window !== "undefined") {
  onSessionEnded(() => {
    signOutMock();
    setSession("signed-out");
  });
}

/**
 * The shell's answer to "is someone signed in?". It starts as "checking" (show a loading screen, never the mock's
 * guess), and becomes "signed-out" as soon as the API ends the session. When the API cannot be reached, the person
 * stays on the last mirrored account.
 */
export function useApiSession(): SessionState {
  const state = useSyncExternalStore(watchSession, () => session, () => "checking" as const);
  useEffect(() => {
    // Ask unless we already know: first load, tokens removed or added by another tab.
    if (session !== "signed-in" || !hasTokens()) void restoreSession();
  }, [state]);
  return state;
}

// ----- Passwords -----

/** The answer is always the same. In development the API may also return the reset token (preview link). */
export async function requestPasswordReset(email: string): Promise<Result<{ token?: string }>> {
  try {
    const r = await request<{ resetToken?: string }>("/auth/password/forgot", { method: "POST", auth: false, body: { workEmail: email.trim() } });
    return ok({ token: r.resetToken });
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function resetPassword(token: string, password: string, confirm: string): Promise<Result> {
  if (password !== confirm) return fail("Passwords do not match."); // quick feedback only: the API checks it again
  try {
    await request("/auth/password/reset", { method: "POST", auth: false, body: { token, newPassword: password, confirmPassword: confirm } });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

/** Also finishes the mandatory first-login change of a temporary password. */
export async function changePassword(current: string, next: string, confirm: string): Promise<Result> {
  if (next !== confirm) return fail("Passwords do not match."); // quick feedback only: the API checks it again
  try {
    await request("/auth/password/change", { method: "POST", body: { currentPassword: current, newPassword: next, confirmPassword: confirm } });
  } catch (e) {
    return fail(errorText(e));
  }
  mutate((d) => {
    const u = d.users.find((x) => x.id === d.currentUserId);
    if (u) u.mustChangePassword = false;
  });
  try {
    await refreshMirror(); // a user's profile can be read from now on
  } catch {
    /* the password is changed all the same */
  }
  return ok();
}
