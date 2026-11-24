import { Injectable } from '@nestjs/common';
import { SEARCH_RESULT_LIMIT, type UserSearchResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

/**
 * The PM header search (FR-DIR-10): active AND archived users, by name or User ID. Not by email (PRD
 * FR-DIR-02): every PM finds every user, so an email search would let a PM look up another PM's users by address.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Decision: every PM finds every user of the workspace (see the E02 PR notes). At most 6 results. */
  async searchUsers(actor: PmActor, rawText: string): Promise<UserSearchResponse> {
    const text = rawText.trim();
    if (!text) return { items: [] };

    const rows = await this.prisma.user.findMany({
      where: {
        workspaceId: actor.workspaceId,
        OR: [
          { name: { contains: text, mode: 'insensitive' } },
          { userId: { contains: text, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ name: 'asc' }, { userId: 'asc' }],
      take: SEARCH_RESULT_LIMIT,
      select: { userId: true, name: true, email: true, photoPath: true, archivedAt: true },
    });

    return {
      items: rows.map((r) => ({
        userId: r.userId,
        name: r.name,
        email: r.email,
        photoPath: r.photoPath,
        archived: r.archivedAt !== null,
      })),
    };
  }
}
