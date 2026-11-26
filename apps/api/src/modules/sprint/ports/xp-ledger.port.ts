import type { Tx } from './db.js';

/**
 * The XP a sprint earns.
 *
 * `XpEvent` belongs to E09 (the growth-core module), so this module does not write it
 * (architecture.md section 3.3, rule 5). Instead the on-time sprint event is handed over
 * through this port, inside the same transaction as the submission, so a rolled-back
 * submission awards no XP.
 *
 * The local implementation writes an `OutboxEvent`, which is the sanctioned cross-module
 * channel. When E09's ledger is ready, the provider is swapped and nothing else changes.
 */
export interface XpAwardInput {
  workspaceId: string;
  /** The user who submitted on time. */
  userId: string;
  /** The sprint day, 'YYYY-MM-DD'. The key E09 uses is `sprint:<userId>:<day>`. */
  day: string;
  /** The XP amount, from `XpRule.onTimeSprint`. */
  amount: number;
  /** The submission the award belongs to. */
  submissionId: string;
}

export interface XpLedgerPort {
  /** Awards XP for an on-time sprint submission. Called inside the submission's transaction. */
  awardOnTimeSprint(tx: Tx, input: XpAwardInput): Promise<void>;
}

/** Nest injection token for the XpLedgerPort provider. */
export const XP_LEDGER = Symbol('XP_LEDGER');
