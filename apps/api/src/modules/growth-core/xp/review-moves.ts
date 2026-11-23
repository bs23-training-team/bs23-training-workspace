import type { XpStatus } from '../../../generated/prisma/enums.js';

/**
 * The only moves a PM may make on an XP event (PRD FR-GAM-02):
 *   PENDING -> AWARDED | HELD | REJECTED
 *   HELD    -> AWARDED | REJECTED
 *   AWARDED -> REVERSED   (only awarded XP can be reversed)
 * REJECTED and REVERSED are final.
 */
const ALLOWED: Record<XpStatus, readonly XpStatus[]> = {
  PENDING: ['AWARDED', 'HELD', 'REJECTED'],
  HELD: ['AWARDED', 'REJECTED'],
  AWARDED: ['REVERSED'],
  REJECTED: [],
  REVERSED: [],
};

export function isAllowedMove(from: XpStatus, to: XpStatus): boolean {
  return ALLOWED[from].includes(to);
}
