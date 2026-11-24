import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * Which users a PM may READ about: XP totals, streaks and badge awards.
 *
 * It is the same rule as the directory (E02, GET /directory/users): every PM sees every active user of the
 * workspace. Which users a PM sees is still an open team decision, so it lives here and nowhere else: if the
 * team decides "only the PM's own team", change this one function. Writes (decisions, adjustments, freezes,
 * awards) are a different rule and stay limited to the PM's own users.
 */
export function pmVisibleUsers(workspaceId: string): Prisma.UserWhereInput {
  return { workspaceId, archivedAt: null };
}
