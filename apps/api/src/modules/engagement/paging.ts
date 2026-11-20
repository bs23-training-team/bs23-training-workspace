import { GrowthError } from '../growth-core/index.js';

/** The most rows one page may hold (a group is small, so this is a cap rather than a real limit). */
export const MAX_PAGE = 100;

/** A cursor is the position of the next row. Anything else is refused. */
export function parseCursor(cursor: string | null | undefined): number {
  if (cursor === null || cursor === undefined) {
    return 0;
  }
  if (!/^\d+$/.test(cursor)) {
    throw new GrowthError('VALIDATION', 'The cursor is not valid');
  }
  return Number(cursor);
}

/** Position-based paging over rows already in memory. */
export function paginate<T>(rows: T[], cursor: string | null, limit = MAX_PAGE): { rows: T[]; nextCursor: string | null } {
  const start = parseCursor(cursor);
  const size = Math.min(limit, MAX_PAGE);
  return {
    rows: rows.slice(start, start + size),
    nextCursor: start + size < rows.length ? String(start + size) : null,
  };
}
