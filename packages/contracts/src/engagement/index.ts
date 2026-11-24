// Owner: E10. Types shared by apps/api and apps/web for the engagement module.
// Already re-exported from src/index.ts: do not edit that file.
//
// These describe the routes that are built on develop. Days are "YYYY-MM-DD" (Dhaka). Lists are paged: send
// `cursor` from the previous answer's `nextCursor` (null on the last page). XP itself is in the growth-core types.

// ---------- Kudos ----------

export const KUDOS_CATEGORIES = ['HELPFUL', 'GREAT_EXPLANATION', 'TEAMWORK'] as const;
export type KudosCategory = (typeof KUDOS_CATEGORIES)[number];

/** Body of POST /kudos. The sender is the signed-in user and the day is the server's. */
export interface SendKudosRequest {
  toUserId: string;
  category: KudosCategory;
  message: string;
}

/**
 * The sender only learns that the kudos was sent. Whether the exchange is suspicious, whether the weekly cap cut the
 * XP and the receiver's XP event are not the sender's to know, so they are never in the answer.
 */
export interface SendKudosResponse {
  kudosId: string;
}

/** A kudos as a USER sees it in GET /kudos (what they sent or received). A PM's rows are PmKudosView. */
export interface KudosView {
  id: string;
  fromUserId: string;
  toUserId: string;
  category: KudosCategory;
  message: string;
  sentOn: string;
}

/** What a PM also sees: whether the kudos is part of a suspicious exchange. Never shown to a user. */
export interface PmKudosView extends KudosView {
  suspicious: boolean;
}

export interface KudosPage<T extends KudosView = KudosView> {
  kudos: T[];
  nextCursor: string | null;
}

// ---------- Leaderboard ----------

export const LEADERBOARD_WINDOWS = ['weekly', 'monthly', 'all'] as const;
export type LeaderboardWindow = (typeof LEADERBOARD_WINDOWS)[number];

/** The name shown for a user who opted out of the board. */
export const HIDDEN_USER_NAME = 'Hidden user';

/**
 * A row as a user sees it. Carries no user id and no email. A hidden user is named "Hidden user" and has no level.
 * The viewer's own row is named "You" and has `isYou: true`.
 */
export type PeerLeaderboardRow =
  | { rank: number; name: string; xp: number; level: string | null; isYou?: true }
  | { rank: number; name: typeof HIDDEN_USER_NAME; xp: number };

/** A row as a PM sees it: the whole group by name. */
export interface PmLeaderboardRow {
  userId: string;
  rank: number;
  name: string;
  xp: number;
  level: string | null;
  /** The user opted out of the board for their peers. */
  hiddenFromPeers: boolean;
}

/** Answer of GET /leaderboard?window=. The level is always from all-time XP. */
export type LeaderboardResponse =
  | { window: LeaderboardWindow; viewer: 'USER'; rows: PeerLeaderboardRow[]; nextCursor: string | null }
  | { window: LeaderboardWindow; viewer: 'PM'; rows: PmLeaderboardRow[]; nextCursor: string | null };

/** Answer of GET and PUT /me/leaderboard-preference. */
export interface LeaderboardPreference {
  hidden: boolean;
}

export type SetLeaderboardPreferenceRequest = LeaderboardPreference;

// ---------- Quests ----------

/** Body of POST /pm/quests. Target at least 1, reward 0 or more, end date not before the start date. */
export interface CreateQuestRequest {
  name: string;
  description: string;
  target: number;
  reward: number;
  startDate: string;
  endDate: string;
}

export interface CreateQuestResponse {
  questId: string;
}

export interface QuestView {
  id: string;
  name: string;
  description: string;
  target: number;
  reward: number;
  startDate: string;
  endDate: string;
}

export interface QuestPage {
  quests: QuestView[];
  nextCursor: string | null;
}

/** Body of POST /pm/quests/:id/progress: a PM records a user's count (0 or more). */
export interface SetQuestProgressRequest {
  userId: string;
  count: number;
}

export interface SetQuestProgressResponse {
  count: number;
}

/** Body of POST /pm/quests/:id/verify. */
export interface VerifyQuestRequest {
  userId: string;
}

/** The XP is paid once: a second verify answers ALREADY_PAID. */
export type VerifyQuestResponse =
  | { paid: true; amount: number; eventId: string }
  | { paid: false; reason: 'BELOW_TARGET'; count: number; target: number }
  | { paid: false; reason: 'ALREADY_PAID' };

/** Progress of one user on one quest (GET /me/quest-progress and GET /pm/quest-progress?questId=). */
export interface QuestProgressView {
  questId: string;
  userId: string;
  count: number;
  verifiedAt: string | null;
}
