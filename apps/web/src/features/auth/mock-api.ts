"use client";

// What is left of the auth mock: profile, photo and the session list (until they are connected), and two helpers.
// Sign-in, sign-out and the passwords are real (see ./api).

import { Result, fail, ok } from "@/lib/mock/core";
import { getDB, mutate } from "@/lib/mock/store";
import { userById } from "@/lib/mock/selectors";
import { latestEvaluation } from "@/features/assessment/mock-api";
import { logout as apiLogout } from "./api";


/** The page a signed-in user starts on. Reads the mock store (the compatibility mirror and the mock assessment). */
export function homeFor(userId: string) {
  const db = getDB();
  const u = userById(db, userId);
  if (!u) return "/login";
  if (u.role === "PM") return "/pm/dashboard";
  if (u.mustChangePassword) return "/change-password";
  if (!latestEvaluation(db, u.id)) return "/trainee/onboarding";
  return "/trainee/dashboard";
}

/**
 * Sign out. The mock sign-in is cleared AT ONCE (the shell reacts and redirects), and the API session and the saved
 * tokens are ended right behind it. The shell calls this one, not the async `logout` in ./api.
 */
export function logout() {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== d.currentSessionId);
    d.currentUserId = null;
    d.currentSessionId = null;
  });
  void apiLogout();
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

/** Quick check before an upload, for fast feedback. */
export function validatePhoto(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return "Choose a JPG, PNG or WebP image under 2 MB.";
  return null;
}

export function setPhoto(userId: string, dataUrl: string | undefined) {
  mutate((d) => {
    d.users.find((x) => x.id === userId)!.photoUrl = dataUrl;
  });
}
