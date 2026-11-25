"use client";

// Real API client for the auth feature (E01). Same shape as ./mock-api (`Result`), but async.
// Routes: apps/api/src/modules/identity/identity.controller.ts.
//
// WHO IS SIGNED IN is decided here, by the API: `restoreSession()` asks `GET /auth/me` with the saved tokens, and
// the shell (`useApiSession`) waits for the answer. The mock store is never trusted for that.
//
// COMPATIBILITY MIRROR (temporary): the dashboards and every other module that is not connected yet still read
// "the current user" and their own mock records from the mock store (`currentUser(db)`, `db.trainees` ...). So the
// API's user is COPIED into that store (`syncMockUser`) after every sign-in and every page load. It is a read-only
// copy: the API is the truth, and it is overwritten each time. Delete it when the last mock module is connected.

import { useEffect, useState } from "react";
import { ApiError, clearTokens, hasTokens, onSessionEnded, request, requestBlob, setTokens } from "@/lib/api-client";
import { fail, nowIso, ok, type Result } from "@/lib/mock/core";
import { mutate } from "@/lib/mock/store";

/** What `POST /auth/login`, `/auth/refresh` and `GET /auth/me` return as `user`. */
export type ApiUser = {
  id: string;
  name: string;
  email: string;
  /** 'PM', or a User's resource: TRAINEE | CENTRAL_LND | INDUSTRIAL_ATTACHMENT | SBU. */
  role: "PM" | "TRAINEE" | "CENTRAL_LND" | "INDUSTRIAL_ATTACHMENT" | "SBU";
  workspaceId: string;
  mustChangePassword: boolean;
  resource?: string;
  /** Only `GET /auth/me` returns these two. */
  bio?: string;
  hasPhoto?: boolean;
};

type LoginResponse = { accessToken: string; refreshToken: string; user: ApiUser };

/** `true` once the API has confirmed the saved tokens in this page load, so a page change does not ask again. */
let verified = false;

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** Every User role (any resource) is a "TRAINEE" in the web's own two-role model. */
const webRole = (u: ApiUser) => (u.role === "PM" ? "PM" : "TRAINEE");

/** Copy the API's user into the mock store (the compatibility mirror above). Overwrites what is there. */
function syncMockUser(u: ApiUser) {
  mutate((d) => {
    const row = {
      id: u.id,
      email: u.email,
      name: u.name,
      role: webRole(u) as "PM" | "TRAINEE",
      mustChangePassword: u.mustChangePassword,
      emailVerified: true,
      ...(u.role === "PM" ? { pmCode: u.id } : {}),
    };
    const i = d.users.findIndex((x) => x.id === u.id);
    if (i >= 0) d.users[i] = { ...d.users[i], ...row };
    else d.users.push({ ...row, password: "", createdAt: nowIso() });
    if (u.role === "PM" && !d.notificationPrefs.some((p) => p.userId === u.id)) {
      d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: u.id, showInBell: true })));
    }
    d.currentUserId = u.id;
    d.currentSessionId = `api-${u.id}`;
  });
}

function signOutMock() {
  mutate((d) => {
    d.currentUserId = null;
    d.currentSessionId = null;
  });
}

function homeFor(u: ApiUser) {
  if (u.mustChangePassword) return "/change-password";
  return u.role === "PM" ? "/pm/dashboard" : "/trainee/dashboard";
}

/** `identifier` is the PM's email or the user's ID (the API decides which table to look in). */
export async function login(identifier: string, password: string, remember: boolean): Promise<Result<{ redirect: string }>> {
  try {
    const r = await request<LoginResponse>("/auth/login", { method: "POST", auth: false, body: { identifier: identifier.trim(), password, rememberMe: remember } });
    setTokens({ accessToken: r.accessToken, refreshToken: r.refreshToken });
    syncMockUser(r.user);
    verified = true; // the API has just answered for these tokens
    await loadProfileExtras(); // bio and photo; a failure here never blocks the sign-in
    return ok({ redirect: homeFor(r.user) });
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
  verified = false;
  signOutMock();
}

// ----- Who is signed in: the API decides (GET /auth/me), the shell waits for it -----

/**
 * Asks the API who the saved tokens belong to.
 * - "signed-in": the API knows them (the mirror is refreshed, so a changed name, role or forced password change shows).
 * - "signed-out": no tokens, or the API refused them (the session ended or the account was archived).
 * - "unavailable": the API could not be reached or failed. The person is NOT signed out for that.
 */
export async function restoreSession(): Promise<"signed-in" | "signed-out" | "unavailable"> {
  if (!hasTokens()) {
    signOutMock();
    return "signed-out";
  }
  try {
    const r = await request<{ user: ApiUser }>("/auth/me");
    syncMockUser(r.user);
    await applyProfile(r.user);
    return "signed-in";
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      signOutMock(); // api-client already forgot the tokens
      return "signed-out";
    }
    return "unavailable";
  }
}

export type SessionState = "checking" | "signed-in" | "signed-out";

/**
 * The shell's answer to "is someone signed in?". It starts as "checking" (show a loading screen, never the mock's
 * guess), and becomes "signed-out" as soon as the API ends the session, even while the person is on a page.
 */
export function useApiSession(): SessionState {
  const [state, setState] = useState<SessionState>(() => (verified && hasTokens() ? "signed-in" : "checking"));
  useEffect(() => {
    let alive = true;
    if (!(verified && hasTokens())) {
      void restoreSession().then((r) => {
        verified = r === "signed-in";
        if (alive) setState(r === "signed-out" ? "signed-out" : "signed-in");
      });
    }
    const off = onSessionEnded(() => {
      verified = false;
      signOutMock();
      if (alive) setState("signed-out");
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return state;
}

export async function me(): Promise<Result<ApiUser>> {
  try {
    const r = await request<{ user: ApiUser }>("/auth/me");
    return ok(r.user);
  } catch (e) {
    return fail(errorText(e));
  }
}

/** Answer is always the same. In development the API may also return the reset token (preview link). */
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
    mutate((d) => {
      const u = d.users.find((x) => x.id === d.currentUserId);
      if (u) u.mustChangePassword = false;
    });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

// ----- Own profile: name, bio, photo (PATCH /auth/me/profile, PUT/GET/DELETE /auth/me/photo) -----

const setMockProfile = (patch: { name?: string; bio?: string; photoUrl?: string | undefined }) =>
  mutate((d) => {
    const u = d.users.find((x) => x.id === d.currentUserId);
    if (!u) return;
    if (patch.name !== undefined) u.name = patch.name;
    if (patch.bio !== undefined) u.bio = patch.bio;
    if ("photoUrl" in patch) u.photoUrl = patch.photoUrl;
  });

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/** Copy the saved bio and photo into the mock store so the screens show them. A failure here is never fatal. */
async function applyProfile(u: { bio?: string; hasPhoto?: boolean }) {
  try {
    setMockProfile({ bio: u.bio ?? "" });
    if (u.hasPhoto) setMockProfile({ photoUrl: await blobToDataUrl(await requestBlob("/auth/me/photo")) });
    else setMockProfile({ photoUrl: undefined });
  } catch {
    /* the profile extras are optional */
  }
}

/** After sign-in the login answer has no bio or photo, so ask `GET /auth/me` once. */
async function loadProfileExtras() {
  try {
    const r = await request<{ user: ApiUser }>("/auth/me");
    await applyProfile(r.user);
  } catch {
    /* optional */
  }
}

export async function updateProfile(input: { name: string; bio: string }): Promise<Result> {
  if (!input.name.trim()) return fail("Display name cannot be empty."); // quick feedback only: the API checks it again
  try {
    const r = await request<{ user: { name: string; bio: string } }>("/auth/me/profile", { method: "PATCH", body: { name: input.name, bio: input.bio } });
    setMockProfile({ name: r.user.name, bio: r.user.bio });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function uploadPhoto(file: File): Promise<Result> {
  try {
    const form = new FormData();
    form.append("photo", file);
    await request("/auth/me/photo", { method: "PUT", form });
    setMockProfile({ photoUrl: await blobToDataUrl(file) });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

export async function removePhoto(): Promise<Result> {
  try {
    await request("/auth/me/photo", { method: "DELETE" });
    setMockProfile({ photoUrl: undefined });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}

// ----- Sessions card (GET /auth/sessions, DELETE /auth/sessions/:id) -----

/** One live session of the signed-in account. `device` is the browser's User-Agent text. */
export type ApiSession = {
  id: string;
  device: string | null;
  remembered: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  /** True for the session this browser is using. */
  current: boolean;
};

export async function listSessions(): Promise<Result<ApiSession[]>> {
  try {
    const r = await request<{ sessions: ApiSession[] }>("/auth/sessions");
    return ok(r.sessions);
  } catch (e) {
    return fail(errorText(e));
  }
}

/**
 * Ends one of the caller's OTHER sessions; that device is signed out on its next call. For the current session
 * use `logout()` instead (the card shows no button for it).
 */
export async function endSession(sessionId: string): Promise<Result> {
  try {
    await request(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return ok();
  } catch (e) {
    return fail(errorText(e));
  }
}
