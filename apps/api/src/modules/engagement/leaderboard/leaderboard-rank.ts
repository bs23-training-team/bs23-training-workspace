import { GrowthError, addDays, weekStart, type DayString } from '../../growth-core/index.js';

export type LeaderboardWindow = 'weekly' | 'monthly' | 'all';

export const MAX_PAGE = 100;
export const HIDDEN_NAME = 'Hidden user';

/** One person on the board, before the viewer's privacy rules are applied. */
export interface Candidate {
  userId: string;
  name: string;
  /** AWARDED XP inside the window. */
  xp: number;
  /** The level name from ALL-TIME XP, whatever the window. Null when the workspace has no levels. */
  level: string | null;
  hidden: boolean;
}

export type RankedCandidate = Candidate & { rank: number };

/** What another user sees: no user id, and a hidden user carries no name or level at all. */
export type PeerRow =
  | { rank: number; name: string; xp: number; level: string | null; isYou?: true }
  | { rank: number; name: typeof HIDDEN_NAME; xp: number };

/** What a PM sees: everyone by name, hidden users tagged. */
export interface PmRow {
  userId: string;
  rank: number;
  name: string;
  xp: number;
  level: string | null;
  hiddenFromPeers: boolean;
}

/**
 * The XP window as org-time days. weekly: from this week's Monday to today; monthly: the last
 * 30 days including today (assumed, not calendar month); all: no bounds.
 */
export function windowRange(window: LeaderboardWindow, today: DayString): { from?: DayString; to?: DayString } {
  switch (window) {
    case 'weekly':
      return { from: weekStart(today), to: today };
    case 'monthly':
      return { from: addDays(today, -29), to: today };
    case 'all':
      return {};
  }
}

/**
 * Sorts by XP and gives ranks where ties share a rank (1, 2, 2, 4). Hidden users stay in the
 * ranking so nobody's rank shifts. Inside a tie, visible people come first (by name) and hidden
 * people last, so the order never reveals anything about a hidden person's name.
 */
export function rankCandidates(candidates: Candidate[]): RankedCandidate[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      b.xp - a.xp ||
      Number(a.hidden) - Number(b.hidden) ||
      (a.hidden ? 0 : a.name.localeCompare(b.name)) ||
      a.userId.localeCompare(b.userId),
  );
  return sorted.map((c) => ({ ...c, rank: 1 + sorted.filter((o) => o.xp > c.xp).length }));
}

/** The board as another user (a peer) sees it. Nothing here carries a user id or an email. */
export function toPeerRows(ranked: RankedCandidate[], viewerUserId: string): PeerRow[] {
  return ranked.map((c): PeerRow => {
    if (c.userId === viewerUserId) {
      return { rank: c.rank, name: 'You', xp: c.xp, level: c.level, isYou: true };
    }
    if (c.hidden) {
      return { rank: c.rank, name: HIDDEN_NAME, xp: c.xp };
    }
    return { rank: c.rank, name: c.name, xp: c.xp, level: c.level };
  });
}

/** The board as a PM sees it: their whole group by name. */
export function toPmRows(ranked: RankedCandidate[]): PmRow[] {
  return ranked.map((c) => ({
    userId: c.userId,
    rank: c.rank,
    name: c.name,
    xp: c.xp,
    level: c.level,
    hiddenFromPeers: c.hidden,
  }));
}

/** Position-based paging: the cursor is the index of the next row. */
export function paginate<T>(rows: T[], cursor: string | null, limit = MAX_PAGE): { rows: T[]; nextCursor: string | null } {
  let start = 0;
  if (cursor !== null) {
    if (!/^\d+$/.test(cursor)) {
      throw new GrowthError('VALIDATION', 'The cursor is not valid');
    }
    start = Number(cursor);
  }
  const size = Math.min(limit, MAX_PAGE);
  const page = rows.slice(start, start + size);
  return { rows: page, nextCursor: start + size < rows.length ? String(start + size) : null };
}
