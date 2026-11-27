"use client";

// Real API client for this module. Connected so far: Add PM and Add user (E01's identity routes) and the teams of
// the signed-in PM (GET and POST /directory/teams). Screens that are not connected yet still use ./mock-api.
// See docs/web-api-integration.md.

import type { TeamListItem, TeamListResponse } from "@bs23/contracts";
import { ApiError, request } from "@/lib/api-client";
import { fail, ok, type Result } from "@/lib/mock/core";
import type { TraineeInput } from "./mock-api";

export type ApiTeam = TeamListItem;

/** Shown once after an account is created (FR-AUTH-08). */
export interface AccountCredentials {
  name: string;
  accountId: string;
  email: string;
  tempPassword: string;
  /** True only when a mail provider really delivered the sign-in email. */
  emailSent: boolean;
}

type CreatedAccount = { name: string; email: string; emailSent: boolean };

async function run<T>(call: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await call());
  } catch (e) {
    return fail(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
  }
}

/** Add PM (FR-DIR-09). The API checks every rule; the web only shows what came back. */
export function createPM(input: { name: string; email: string; pmCode: string; password: string }): Promise<Result<AccountCredentials>> {
  return run(async () => {
    const r = await request<CreatedAccount & { pmId: string }>("/auth/accounts/pms", {
      method: "POST",
      body: { pmId: input.pmCode.trim().toUpperCase(), name: input.name.trim(), email: input.email.trim(), password: input.password },
    });
    return { name: r.name, accountId: r.pmId, email: r.email, tempPassword: input.password, emailSent: r.emailSent };
  });
}

/** Add user (FR-DIR-03). `input.teamIds` must be team IDs of the API (see `listMyTeams`). */
export function createTrainee(input: TraineeInput): Promise<Result<AccountCredentials>> {
  return run(async () => {
    const tempPassword = input.tempPassword ?? "";
    const r = await request<CreatedAccount & { userId: string }>("/auth/accounts/trainees", {
      method: "POST",
      body: {
        userId: input.traineeId.trim().toUpperCase(),
        name: input.name.trim(),
        email: input.email.trim(),
        temporaryPassword: tempPassword,
        position: input.position,
        attendanceMode: input.attendanceMode,
        resource: input.resource,
        onboardDate: input.onboardDate,
        departureDate: input.periodEnd,
        teamIds: input.teamIds,
        skillAssessmentMinutes: input.skillAssessmentMinutes,
        skillAssessmentMarks: input.skillAssessmentMarks,
      },
    });
    return { name: r.name, accountId: r.userId, email: r.email, tempPassword, emailSent: r.emailSent };
  });
}

/** The teams the signed-in PM manages. A new user can only be added to one of these. */
export function listMyTeams(): Promise<Result<ApiTeam[]>> {
  return run(async () => {
    const r = await request<TeamListResponse>("/directory/teams");
    return r.items.filter((t) => t.managedByYou);
  });
}

/** The signed-in PM becomes the PM of the new team. */
export function createTeam(name: string): Promise<Result<ApiTeam>> {
  return run(() => request<ApiTeam>("/directory/teams", { method: "POST", body: { name } }));
}
