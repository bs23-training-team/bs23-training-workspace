// Owner: E09. Types shared by apps/api and apps/web for the growth-core module.
// Already re-exported from src/index.ts: do not edit that file.
//
// These describe the routes that are built on develop. Days are "YYYY-MM-DD" (Dhaka), timestamps are
// ISO strings. Lists are paged: send `cursor` from the previous answer's `nextCursor` (null on the last page).
// A route answers an error with an HTTP status and a JSON message (401 no token, 403 wrong role or not your user).

// ---------- XP ----------

export const XP_STATUSES = ['PENDING', 'AWARDED', 'HELD', 'REJECTED', 'REVERSED'] as const;
export type XpStatus = (typeof XP_STATUSES)[number];

/** The statuses a PM can move an XP event to. */
export const XP_DECISIONS = ['AWARDED', 'HELD', 'REJECTED', 'REVERSED'] as const;
export type XpDecision = (typeof XP_DECISIONS)[number];

export const XP_SOURCES = ['ON_TIME_SPRINT', 'VERIFIED_MODULE', 'FINAL_ASSESSMENT', 'KUDOS', 'QUEST', 'MANUAL_ADJUSTMENT'] as const;
export type XpSource = (typeof XP_SOURCES)[number];

/** One XP event. Only AWARDED XP counts toward the total. */
export interface XpEventView {
  id: string;
  userId: string;
  source: XpSource;
  amount: number;
  status: XpStatus;
  reason: string | null;
  /** For example "Suspicious exchange" or "Weekly received cap reached". */
  flag: string | null;
  evidence: string;
  occurredOn: string;
  createdAt: string;
}

/** Answer of GET /pm/xp-events and GET /me/xp-events. */
export interface XpEventPage {
  events: XpEventView[];
  nextCursor: string | null;
}

/** Query of GET /pm/xp-events. */
export interface XpQueueQuery {
  status?: XpStatus;
  userId?: string;
  cursor?: string;
}

/** Answer of GET /me/growth. */
export interface MyGrowth {
  /** XP that counts: AWARDED only. */
  awardedXp: number;
  /** XP waiting for a PM (PENDING and HELD). Never added to the total. */
  pendingXp: number;
  level: string | null;
  streak: { current: number; longest: number };
  /** Badges the user holds. */
  badges: { badgeId: string; name: string; icon: string; awardedAt: string }[];
}

/** Body of POST /pm/xp-events/:id/decision. A reason is required. */
export interface DecideXpRequest {
  status: XpDecision;
  reason: string;
}

export interface DecideXpResponse {
  eventId: string;
  fromStatus: XpStatus;
  toStatus: XpStatus;
}

/** Body of POST /pm/xp-adjustments. A whole number that is not 0; the total can never go below 0. */
export interface AdjustXpRequest {
  userId: string;
  amount: number;
  reason: string;
}

export interface AdjustXpResponse {
  eventId: string;
  /** The user's awarded total after this adjustment. */
  newTotal: number;
}

// ---------- XP rules and levels ----------

/** The XP rules of the workspace: answer of GET and PUT /pm/xp-rules. */
export interface XpRules {
  verifiedModule: number;
  verifiedModuleDailyCap: number;
  onTimeSprint: number;
  finalAssessment: number;
  kudos: number;
  kudosSendLimitPerWeek: number;
  kudosCooldownDays: number;
  kudosReceivedCapPerWeek: number;
  streakMilestone: number;
  streakMilestoneDays: number;
  pmReviewMultiplier: number;
  engagementDropAlertPct: number;
  /** "HH:MM" Dhaka time. A sprint strictly before this is on time. */
  sprintCutoff: string;
  updatedById: string | null;
}

/** Body of PUT /pm/xp-rules: any subset of the rules, at least one. */
export type XpRulesEdit = Partial<Omit<XpRules, 'updatedById'>>;

export interface LevelInput {
  name: string;
  minXp: number;
}

/** An active level: answer of GET /levels (each item) and PUT /pm/levels. */
export interface Level extends LevelInput {
  id: string;
}

/** Body of PUT /pm/levels. Saved as one set: the first level starts at 0 and the numbers rise. */
export interface SaveLevelsRequest {
  levels: LevelInput[];
}

// ---------- Streak freezes ----------

export const FREEZE_SOURCES = ['LEAVE', 'HOLIDAY'] as const;
export type FreezeSource = (typeof FREEZE_SOURCES)[number];

/** Body of POST /pm/streak-freezes. */
export interface GrantFreezeRequest {
  userId: string;
  date: string;
  source: FreezeSource;
  reason: string;
}

export interface GrantFreezeResponse {
  freezeId: string;
}

/** A freeze as a PM sees it (GET /pm/streak-freezes?userId=). */
export interface PmStreakFreeze {
  id: string;
  date: string;
  source: FreezeSource;
  reason: string;
  grantedById: string;
}

/** A freeze as the user sees it (GET /me/streak-freezes): never the reason. */
export interface MyStreakFreeze {
  date: string;
  source: FreezeSource;
}

// ---------- Badges ----------

export const BADGE_KINDS = ['BEHAVIORAL', 'SPECIAL'] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const BADGE_RULE_TYPES = ['ON_TIME_SPRINT_STREAK', 'SPRINT_STREAK', 'KUDOS_DISTINCT_SENDERS', 'MANUAL'] as const;
export type BadgeRuleType = (typeof BADGE_RULE_TYPES)[number];

/** Body of POST /pm/badges. A Behavioral badge needs a rule and a threshold of at least 1; a Special badge is MANUAL. */
export interface CreateBadgeRequest {
  name: string;
  /** An emoji. */
  icon: string;
  kind: BadgeKind;
  criteria: string;
  ruleType?: BadgeRuleType;
  threshold?: number | null;
}

export interface CreateBadgeResponse {
  badgeId: string;
  /** How many users already met the rule and received it at once. */
  awarded: number;
}

/** Body of POST /pm/badges/:id/awards (Special badges only). Evidence is required. */
export interface AwardBadgeRequest {
  userId: string;
  evidence: string;
}

export interface AwardBadgeResponse {
  awardId: string;
}

/** Body of POST /pm/badge-awards/:id/revoke. A reason is required. */
export interface RevokeBadgeRequest {
  reason: string;
}

export interface RetireBadgeResponse {
  retired: true;
}

export interface RevokeBadgeResponse {
  revoked: true;
}
