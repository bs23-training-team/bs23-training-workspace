"use client";

// Real API client for the gamification-core feature (E09). Types come from the contract; the routes are listed in
// apps/api/src/modules/growth-core/README.md. A screen that is not connected yet still uses ./mock-api.
//
// - A read throws the shared client's ApiError (see ./hooks for the loading and error states).
// - A change returns a `Result`, like ./mock-api, so a screen shows the API's own message. The API checks every rule.

import type {
  AdjustXpRequest,
  AdjustXpResponse,
  AwardBadgeRequest,
  AwardBadgeResponse,
  BadgePage,
  CreateBadgeRequest,
  CreateBadgeResponse,
  DecideXpRequest,
  DecideXpResponse,
  GrantFreezeRequest,
  GrantFreezeResponse,
  Level,
  LevelInput,
  MyGrowth,
  MyStreakFreeze,
  MyXpEventPage,
  MyXpEventView,
  PmBadgeView,
  PmGrowthSummaryPage,
  PmGrowthSummaryRow,
  PmStreakFreeze,
  RetireBadgeResponse,
  RevokeBadgeRequest,
  RevokeBadgeResponse,
  UserBadgeView,
  XpEventPage,
  XpEventView,
  XpQueueQuery,
  XpRules,
  XpRulesEdit,
} from "@bs23/contracts";
import { ApiError, request } from "@/lib/api-client";
import { fail, ok, type Result } from "@/lib/mock/core";

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

function withQuery(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value) query.set(name, value);
  return query.size ? `${path}?${query}` : path;
}

/** Follows `nextCursor` to the last page, for the lists a screen shows whole. */
async function allPages<P extends { nextCursor: string | null }, T>(read: (cursor: string | null) => Promise<P>, rows: (page: P) => T[]): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null = null;
  do {
    const page: P = await read(cursor);
    all.push(...rows(page));
    cursor = page.nextCursor;
  } while (cursor !== null);
  return all;
}

async function change<T>(path: string, method: "POST" | "PUT", body?: unknown): Promise<Result<T>> {
  try {
    return ok(await request<T>(path, { method, body }));
  } catch (e) {
    return fail(errorText(e));
  }
}

const id = encodeURIComponent;

// ---------- A user's own records ----------

export const getMyGrowth = () => request<MyGrowth>("/me/growth");

export const getMyXpEvents = (cursor?: string | null) => request<MyXpEventPage>(withQuery("/me/xp-events", { cursor }));

/** The whole history, newest first. */
export const getAllMyXpEvents = (): Promise<MyXpEventView[]> => allPages(getMyXpEvents, (page) => page.events);

export const getMyStreakFreezes = () => request<MyStreakFreeze[]>("/me/streak-freezes");

// ---------- Badges and levels ----------

/** GET /badges answers differently for a user and for a PM: `viewer` says which one this is. */
export const getBadgePage = (cursor?: string | null) => request<BadgePage>(withQuery("/badges", { cursor }));

/** Every badge with the signed-in user's own award and progress. For a user's screens only. */
export const getMyBadges = (): Promise<UserBadgeView[]> => allPages(getBadgePage, (page) => (page.viewer === "USER" ? page.badges : []));

/** Every badge with who holds it. For a PM's screens only. */
export const getPmBadges = (): Promise<PmBadgeView[]> => allPages(getBadgePage, (page) => (page.viewer === "PM" ? page.badges : []));

export const getLevels = () => request<Level[]>("/levels");

// ---------- PM reads ----------

export const getXpEvents = ({ status, userId, cursor }: XpQueueQuery = {}) => request<XpEventPage>(withQuery("/pm/xp-events", { status, userId, cursor }));

/** Every event that matches, newest first. */
export const getAllXpEvents = (query: Omit<XpQueueQuery, "cursor"> = {}): Promise<XpEventView[]> =>
  allPages(
    (cursor) => getXpEvents({ ...query, cursor: cursor ?? undefined }),
    (page) => page.events,
  );

export const getPmGrowthSummary = (): Promise<PmGrowthSummaryRow[]> =>
  allPages(
    (cursor) => request<PmGrowthSummaryPage>(withQuery("/pm/growth-summary", { cursor })),
    (page) => page.users,
  );

export const getPmStreakFreezes = (userId: string) => request<PmStreakFreeze[]>(withQuery("/pm/streak-freezes", { userId }));

export const getXpRules = () => request<XpRules>("/pm/xp-rules");

// ---------- PM changes ----------

export const decideXp = (eventId: string, body: DecideXpRequest) => change<DecideXpResponse>(`/pm/xp-events/${id(eventId)}/decision`, "POST", body);

export const adjustXp = (body: AdjustXpRequest) => change<AdjustXpResponse>("/pm/xp-adjustments", "POST", body);

export function saveXpRules(edit: XpRulesEdit) {
  // A whole `XpRules` object also fits the type. The API sets `updatedById` itself and refuses it in the body.
  const body: Partial<XpRules> = { ...edit };
  delete body.updatedById;
  return change<XpRules>("/pm/xp-rules", "PUT", body);
}

/** The whole level set. The API reads only the name and the threshold of each level. */
export const saveLevels = (levels: LevelInput[]) => change<Level[]>("/pm/levels", "PUT", { levels: levels.map(({ name, minXp }) => ({ name, minXp })) });

export const grantStreakFreeze = (body: GrantFreezeRequest) => change<GrantFreezeResponse>("/pm/streak-freezes", "POST", body);

export const createBadge = (body: CreateBadgeRequest) => change<CreateBadgeResponse>("/pm/badges", "POST", body);

export const retireBadge = (badgeId: string) => change<RetireBadgeResponse>(`/pm/badges/${id(badgeId)}/retire`, "POST");

export const awardBadge = (badgeId: string, body: AwardBadgeRequest) => change<AwardBadgeResponse>(`/pm/badges/${id(badgeId)}/awards`, "POST", body);

/** Takes the id of the AWARD, not of the badge. */
export const revokeBadge = (awardId: string, body: RevokeBadgeRequest) => change<RevokeBadgeResponse>(`/pm/badge-awards/${id(awardId)}/revoke`, "POST", body);
