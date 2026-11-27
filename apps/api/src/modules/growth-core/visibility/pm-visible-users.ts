import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * Which users a PM may READ about: XP totals, streaks and badge awards.
 *
 * It is the same rule as the directory (E02, GET /directory/users): every PM reads every active user of the
 * workspace (FR-GRW-59, team decision of 2026-11-24). Writes (decisions, adjustments, freezes, awards and
 * revokes) are a different rule and stay limited to the PM's own users.
 */
export function pmVisibleUsers(workspaceId: string): Prisma.UserWhereInput {
  return { workspaceId, archivedAt: null };
}

/**
 * For the XP queue and the freeze list: the visible users, and the PM's own users even when archived, so that
 * what a managing PM could read before (for example XP still waiting for a decision) is not lost.
 */
export function pmReadableUsers(workspaceId: string, pmId: string): Prisma.UserWhereInput {
  return { OR: [pmVisibleUsers(workspaceId), { workspaceId, pmId }] };
}

/** The same rule as pmReadableUsers, for one user that is already loaded. */
export function pmMayRead(user: { pmId: string | null; archivedAt: Date | null }, pmId: string): boolean {
  return user.archivedAt === null || user.pmId === pmId;
}
