import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_PEERS_PAGE_SIZE,
  MAX_PEERS_PAGE_SIZE,
  type PeerListQuery,
  type PeerListResponse,
} from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { TraineeActor } from './directory.actor.js';

/**
 * The teammates a trainee can pick (for example to send kudos): the active users of the caller's own PM
 * group, without the caller. Only the User ID and the name are returned: no email, no PM id, no feedback.
 * The leaderboard and the kudos limits are by PM group, so the list is too.
 */
@Injectable()
export class PeersService {
  constructor(private readonly prisma: PrismaService) {}

  async listPeers(actor: TraineeActor, query: PeerListQuery): Promise<PeerListResponse> {
    // The caller's own PM group. An archived user has no page, so it is "not found" (same as /directory/me).
    const me = await this.prisma.user.findFirst({
      where: { userId: actor.userId, workspaceId: actor.workspaceId, archivedAt: null },
      select: { pmId: true },
    });
    if (!me) throw new NotFoundException('User not found.');

    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PEERS_PAGE_SIZE, 1), MAX_PEERS_PAGE_SIZE);

    // Keyset paging on the User ID: stable even when someone is added or archived between two pages.
    const rows = await this.prisma.user.findMany({
      where: {
        workspaceId: actor.workspaceId,
        pmId: me.pmId,
        archivedAt: null,
        userId: { not: actor.userId, ...(query.cursor && { gt: query.cursor }) },
      },
      orderBy: { userId: 'asc' },
      take: limit + 1,
      select: { userId: true, name: true },
    });

    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: rows.length > limit && last ? last.userId : null };
  }
}
