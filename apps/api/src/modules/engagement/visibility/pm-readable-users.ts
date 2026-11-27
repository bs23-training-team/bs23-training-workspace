import type { Prisma } from '../../../generated/prisma/client.js';
import { pmVisibleUsers } from '../../growth-core/index.js';

/**
 * Which users a PM may READ in the engagement lists (kudos, quest progress): every active user of the workspace
 * (FR-ENG-53, team decision of 2026-11-24, same rule as growth-core), and the PM's own users even when archived,
 * so that what a managing PM could read before is not lost.
 *
 * Reading is wide, writing is not: verifying a quest stays limited to the managing PM. This is the same rule as
 * `pmReadableUsers` in growth-core, built on its exported `pmVisibleUsers`, so a change of the visibility rule is
 * made in one place.
 *
 * The kudos reader cannot import the growth-core index (file cycle), so the controller builds this filter and
 * passes it in.
 */
export function pmReadableUsers(workspaceId: string, pmId: string): Prisma.UserWhereInput {
  return { OR: [pmVisibleUsers(workspaceId), { workspaceId, pmId }] };
}
