import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { lockLevels } from '../locks.js';
import type { Db, Tx } from '../ports/db.js';
import type { LevelsPort } from '../ports/levels.port.js';
import { NOTIFICATIONS, type NotificationPort } from '../ports/notification.port.js';
import { diffLevelSets, levelFor, validateLevelSet, type ActiveLevel, type LevelInput } from './level-set.js';

/**
 * Levels (IF-02). A user's level comes from their awarded XP; the PM edits the thresholds.
 * Saving a set never creates a level-up notice: only earned XP does (notifyIfLeveledUp).
 */
@Injectable()
export class LevelsService implements LevelsPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationPort,
  ) {}

  async active(workspaceId: string, db: Db = this.prisma): Promise<ActiveLevel[]> {
    return db.level.findMany({
      where: { workspaceId, retiredAt: null },
      orderBy: { minXp: 'asc' },
      select: { id: true, name: true, minXp: true },
    });
  }

  async levelFor(workspaceId: string, totalXp: number, db: Db = this.prisma): Promise<ActiveLevel | null> {
    return levelFor(await this.active(workspaceId, db), totalXp);
  }

  /**
   * Saves a level set as one set, in one transaction under a per-workspace lock: validate,
   * retire the changed levels, then insert their new versions. Unchanged levels keep their
   * row. Retiring first matters: two active levels may not share a name or threshold.
   */
  async save(workspaceId: string, levels: LevelInput[]): Promise<ActiveLevel[]> {
    const next = validateLevelSet(levels);
    return this.prisma.$transaction(async (tx) => {
      await lockLevels(tx, workspaceId);
      const current = await this.active(workspaceId, tx);
      const { retireIds, insert } = diffLevelSets(current, next);
      if (retireIds.length > 0) {
        await tx.level.updateMany({
          where: { id: { in: retireIds }, workspaceId, retiredAt: null },
          data: { retiredAt: new Date() },
        });
      }
      if (insert.length > 0) {
        await tx.level.createMany({ data: insert.map((l) => ({ workspaceId, name: l.name, minXp: l.minXp })) });
      }
      return this.active(workspaceId, tx);
    });
  }

  async notifyIfLeveledUp(
    tx: Tx,
    input: { workspaceId: string; userId: string; before: number; after: number },
  ): Promise<boolean> {
    if (input.after <= input.before) {
      return false;
    }
    const levels = await this.active(input.workspaceId, tx);
    const was = levelFor(levels, input.before);
    const now = levelFor(levels, input.after);
    if (!now || (was && now.minXp <= was.minXp)) {
      return false;
    }
    await this.notifications.notifyUser(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      category: 'Level up',
      title: 'Level up',
      message: `You reached ${now.name}.`,
    });
    return true;
  }
}
