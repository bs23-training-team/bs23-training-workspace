import type { ActiveLevel } from '../levels/level-set.js';
import type { Db, Tx } from './db.js';

/**
 * IF-02: one definition of a level, owned by growth-core. Engagement uses it for the
 * leaderboard level and, after a quest reward, for the level-up notice.
 */
export interface LevelsPort {
  /** Active (not retired) levels, lowest threshold first. */
  active(workspaceId: string, db?: Db): Promise<ActiveLevel[]>;
  /** The level for an awarded-XP total; null when the workspace has no levels. */
  levelFor(workspaceId: string, totalXp: number, db?: Db): Promise<ActiveLevel | null>;
  /**
   * Creates the "Level up" notice when EARNED XP moved the user from `before` to `after` over
   * a threshold. Call it only for earned XP (an approved decision or a quest reward), inside
   * the transaction that changed the XP. Returns true when a notice was created.
   */
  notifyIfLeveledUp(
    tx: Tx,
    input: { workspaceId: string; userId: string; before: number; after: number },
  ): Promise<boolean>;
}

/** Injection token for the LevelsPort provider. */
export const LEVELS = Symbol('LEVELS');
