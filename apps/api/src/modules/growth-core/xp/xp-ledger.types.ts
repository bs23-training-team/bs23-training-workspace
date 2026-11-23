import type { XpSource, XpStatus } from '../../../generated/prisma/enums.js';
import type { Db } from '../ports/db.js';

/** What a caller gives the ledger to record. The amount and key are decided by the caller's service. */
export interface NewXpEvent {
  workspaceId: string;
  userId: string;
  source: XpSource;
  /** Whole number. Negative only for a manual adjustment. */
  amount: number;
  /** Idempotency key, unique per workspace. Build it with the helpers in xp-keys.ts. */
  key: string;
  evidence: string;
  /** The day the activity happened, as UTC midnight (a @db.Date value). */
  occurredOn: Date;
  /** Defaults by source (see initialStatus). Engagement passes HELD for a suspicious kudos. */
  status?: XpStatus;
  flag?: string | null;
  reason?: string | null;
  kudosId?: string | null;
  questId?: string | null;
  attemptId?: string | null;
}

export interface CreateEventResult {
  event: { id: string };
  /** false when an event with this key already existed: nothing was created or paid twice. */
  created: boolean;
}

export interface AwardedTotalsQuery {
  workspaceId: string;
  userIds: string[];
  /** Inclusive, matched against occurredOn (a day). */
  from?: Date;
  to?: Date;
}

export interface SumXpQuery {
  userId: string;
  /** Only events with one of these statuses are summed. */
  statuses: XpStatus[];
  source?: XpSource;
  /** Inclusive, matched against occurredOn (a day). */
  from: Date;
  to: Date;
}

/**
 * The write side of the XP ledger (IF-01). Only growth-core writes XpEvent: engagement and
 * the other modules call this instead of touching the table.
 * Every method takes an optional `db` so a caller can run it inside its own transaction.
 */
export interface XpLedger {
  createEvent(input: NewXpEvent, db?: Db): Promise<CreateEventResult>;
  awardedTotal(userId: string, db?: Db): Promise<number>;
  awardedTotals(query: AwardedTotalsQuery, db?: Db): Promise<Map<string, number>>;
  /** Sum of a user's XP for the given statuses inside a day window (for the kudos weekly cap). */
  sumXp(query: SumXpQuery, db?: Db): Promise<number>;
  holdPending(kudosIds: string[], flag: string, db?: Db): Promise<void>;
}
