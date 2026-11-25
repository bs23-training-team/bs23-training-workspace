"use client";

// Real API client for the directory feature. Only the account calls are here so far (they belong to E01's
// identity routes: POST /auth/accounts/pms and /trainees, GET and PATCH /auth/accounts/trainees/:userId).
// Same shape as ./mock-api (`Result`), but async. Field names are the API's own names.

import { ApiError, request } from "@/lib/api-client";
import { fail, ok, type Result } from "@/lib/mock/core";
import type { AttendanceMode, Position, Resource } from "@/lib/mock/types";
import type { AccountCredentials, TraineeInput } from "./mock-api";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** `emailSent` is true only when a mail provider really delivered the credentials email (account ID + temporary password). */
type CreatedPm = { pmId: string; name: string; email: string; emailSent: boolean };
type CreatedTrainee = { userId: string; name: string; email: string; emailSent: boolean };

/** The part of GET /directory/teams the Add User form needs (full type: @bs23/contracts, not a web dependency yet). */
export type ApiTeam = { id: string; name: string; managedByYou: boolean };

const mailStatus = (emailSent: boolean): AccountCredentials["mailStatus"] => (emailSent ? "ACCEPTED" : "FAILED");

/** Add PM (FR-DIR-09). The API decides everything; the web only shows what came back. */
export async function createPm(input: { name: string; email: string; pmId: string; password: string }): Promise<Result<AccountCredentials>> {
  try {
    const r = await request<CreatedPm>("/auth/accounts/pms", {
      method: "POST",
      body: { pmId: input.pmId.trim().toUpperCase(), name: input.name, email: input.email, password: input.password },
    });
    return ok({ name: r.name, accountId: r.pmId, email: r.email, temporaryPassword: input.password, deliveryId: "", mailStatus: mailStatus(r.emailSent) });
  } catch (e) {
    return fail(errorText(e));
  }
}

/** Add User (FR-DIR-04). `teamIds` must be real team IDs from `listTeams()`. */
export async function createTrainee(input: TraineeInput): Promise<Result<AccountCredentials>> {
  try {
    const r = await request<CreatedTrainee>("/auth/accounts/trainees", {
      method: "POST",
      body: {
        userId: input.userId.trim(),
        name: input.name,
        email: input.email,
        temporaryPassword: input.temporaryPassword ?? "",
        position: input.position,
        attendanceMode: input.attendanceMode,
        onboardDate: input.onboardDate,
        departureDate: input.departureDate,
        resource: input.resource,
        teamIds: input.teamIds,
        skillAssessmentMinutes: input.skillAssessmentMinutes,
        skillAssessmentMarks: input.skillAssessmentMarks,
      },
    });
    // A user account is active at once. The email is only a notice: it is never needed to sign in.
    return ok({ name: r.name, accountId: r.userId, email: r.email, temporaryPassword: input.temporaryPassword ?? "", deliveryId: "", mailStatus: mailStatus(r.emailSent) });
  } catch (e) {
    return fail(errorText(e));
  }
}

/**
 * The Retry button of the credentials dialog (FR-AUTH-08). The API only keeps a hash of the temporary password, so
 * Retry issues a NEW temporary password, emails it and returns it here (the old one stops working). It only works
 * while the person has not signed in yet.
 */
export async function resendAccountEmail(accountId: string): Promise<Result<{ mailStatus: AccountCredentials["mailStatus"]; temporaryPassword: string }>> {
  try {
    const r = await request<{ emailSent: boolean; temporaryPassword: string }>(`/auth/accounts/${encodeURIComponent(accountId)}/resend-email`, { method: "POST" });
    return ok({ mailStatus: mailStatus(r.emailSent), temporaryPassword: r.temporaryPassword });
  } catch (e) {
    return fail(errorText(e));
  }
}

/** The signed-in PM's own teams (GET /directory/teams): the real IDs the Add User form needs. */
export async function listTeams(): Promise<Result<ApiTeam[]>> {
  try {
    const r = await request<{ items: ApiTeam[] }>("/directory/teams");
    return ok(r.items.filter((t) => t.managedByYou));
  } catch (e) {
    return fail(errorText(e));
  }
}

/** The saved values of one user (GET /auth/accounts/trainees/:userId), for the Edit user form. Dates are "YYYY-MM-DD". */
export type ApiEditableTrainee = {
  userId: string;
  name: string;
  email: string;
  resource: Resource;
  position: Position;
  attendanceMode: AttendanceMode;
  onboardDate: string;
  departureDate: string | null;
  skillAssessmentMinutes: number | null;
  skillAssessmentMarks: number | null;
  /** The signed-in PM's own teams the user belongs to now (real team IDs). */
  teamIds: string[];
  archived: boolean;
};

export type ApiUpdatedTrainee = { reactivated: boolean; passwordReset: boolean; emailSent: boolean };

/** Edit user (FR-DIR-05): read the saved values. Only the signed-in PM's own users exist for this call. */
export async function getTrainee(userId: string): Promise<Result<ApiEditableTrainee>> {
  try {
    return ok(await request<ApiEditableTrainee>(`/auth/accounts/trainees/${encodeURIComponent(userId)}`));
  } catch (e) {
    return fail(errorText(e));
  }
}

/**
 * Edit user (FR-DIR-05). The user ID never changes. A temporary password in the input is a reset (the API ends the
 * user's sessions and emails the new password); an empty one keeps the current password. The API checks every rule.
 */
export async function updateTrainee(userId: string, input: TraineeInput): Promise<Result<ApiUpdatedTrainee>> {
  try {
    const r = await request<ApiUpdatedTrainee>(`/auth/accounts/trainees/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: {
        name: input.name,
        email: input.email,
        position: input.position,
        attendanceMode: input.attendanceMode,
        resource: input.resource,
        onboardDate: input.onboardDate,
        departureDate: input.departureDate,
        teamIds: input.teamIds,
        skillAssessmentMinutes: input.skillAssessmentMinutes,
        skillAssessmentMarks: input.skillAssessmentMarks,
        temporaryPassword: input.temporaryPassword || undefined,
      },
    });
    return ok(r);
  } catch (e) {
    return fail(errorText(e));
  }
}
