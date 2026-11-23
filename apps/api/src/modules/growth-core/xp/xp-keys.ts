/**
 * Idempotency keys for XpEvent. The ledger is unique on (workspaceId, key), so reporting the
 * same fact twice must always build the same key and creates one event, never two.
 *
 * Formats:
 *   sprint:<userId>:<day>        module:<userId>:<topicId>      final:<userId>:<setId>
 *   kudos:<kudosId>              quest:<questId>:<userId>       manual:<uuid>
 */

import { parseDay, type DayString } from '../time/org-time.js';

const SEPARATOR = ':';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A key part must be non-empty and must not contain ":" (it would make two keys collide). */
function part(name: string, value: string): string {
  if (value.trim() === '') {
    throw new Error(`Key part "${name}" must not be empty`);
  }
  if (value.includes(SEPARATOR)) {
    throw new Error(`Key part "${name}" must not contain "${SEPARATOR}"`);
  }
  return value;
}

export function sprintKey(userId: string, day: DayString): string {
  parseDay(day); // throws on anything that is not a real YYYY-MM-DD
  return `sprint:${part('userId', userId)}:${day}`;
}

export function moduleKey(userId: string, topicId: string): string {
  return `module:${part('userId', userId)}:${part('topicId', topicId)}`;
}

export function finalAssessmentKey(userId: string, questionSetId: string): string {
  return `final:${part('userId', userId)}:${part('questionSetId', questionSetId)}`;
}

export function kudosKey(kudosId: string): string {
  return `kudos:${part('kudosId', kudosId)}`;
}

export function questKey(questId: string, userId: string): string {
  return `quest:${part('questId', questId)}:${part('userId', userId)}`;
}

export function manualKey(uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error('Manual key needs a uuid');
  }
  return `manual:${uuid}`;
}
