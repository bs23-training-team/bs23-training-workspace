import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthError } from '../../growth-core/index.js';

/**
 * A user opts out of (or back into) the leaderboard. The setting is the user's own: it takes
 * the signed-in user's id, so a PM has no way to change someone else's.
 */
@Injectable()
export class LeaderboardPreferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async set(workspaceId: string, userId: string, hidden: boolean): Promise<{ hidden: boolean }> {
    const user = await this.prisma.user.findFirst({
      where: { userId, workspaceId, archivedAt: null },
      select: { userId: true },
    });
    if (!user) {
      throw new GrowthError('NOT_FOUND', 'User not found');
    }
    const saved = await this.prisma.leaderboardPreference.upsert({
      where: { userId },
      create: { workspaceId, userId, hidden },
      update: { hidden },
      select: { hidden: true },
    });
    return saved;
  }

  async get(workspaceId: string, userId: string): Promise<{ hidden: boolean }> {
    const row = await this.prisma.leaderboardPreference.findFirst({
      where: { userId, workspaceId },
      select: { hidden: true },
    });
    return { hidden: row?.hidden ?? false };
  }
}
