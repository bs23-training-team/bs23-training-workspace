import type { XpSource, XpStatus } from '../../../generated/prisma/enums.js';

/**
 * The status a new XP event starts in. New XP waits for a PM, except quest XP (awarded as
 * soon as the PM verifies the quest) and manual adjustments (the PM made them).
 * A suspicious kudos is created HELD by engagement, which passes that status explicitly.
 */
export function initialStatus(source: XpSource): XpStatus {
  return source === 'QUEST' || source === 'MANUAL_ADJUSTMENT' ? 'AWARDED' : 'PENDING';
}
