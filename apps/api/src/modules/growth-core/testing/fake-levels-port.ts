import type { ActiveLevel } from '../levels/level-set.js';
import { levelFor } from '../levels/level-set.js';
import type { Tx } from '../ports/db.js';
import type { LevelsPort } from '../ports/levels.port.js';
import type { NotificationPort } from '../ports/notification.port.js';

export const DEFAULT_LEVELS: ActiveLevel[] = [
  { id: 'lvl-1', name: 'Rookie', minXp: 0 },
  { id: 'lvl-2', name: 'Builder', minXp: 250 },
  { id: 'lvl-3', name: 'Pro', minXp: 600 },
  { id: 'lvl-4', name: 'Expert', minXp: 1200 },
];

/** Fixed levels in memory, with the same level-up rule as LevelsService. */
export class FakeLevelsPort implements LevelsPort {
  constructor(
    private readonly notifications: NotificationPort,
    private readonly levels: ActiveLevel[] = DEFAULT_LEVELS,
  ) {}

  async active(): Promise<ActiveLevel[]> {
    return this.levels;
  }

  async levelFor(_workspaceId: string, totalXp: number): Promise<ActiveLevel | null> {
    return levelFor(this.levels, totalXp);
  }

  async notifyIfLeveledUp(
    tx: Tx,
    input: { workspaceId: string; userId: string; before: number; after: number },
  ): Promise<boolean> {
    const was = levelFor(this.levels, input.before);
    const now = levelFor(this.levels, input.after);
    if (input.after <= input.before || !now || (was && now.minXp <= was.minXp)) {
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
