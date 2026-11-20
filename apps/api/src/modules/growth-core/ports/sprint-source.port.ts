import type { DayString } from '../time/org-time.js';
import type { Db } from './db.js';

export interface SprintSubmissionFact {
  day: DayString;
  onTime: boolean;
}

/**
 * Read-only port to the sprint module (E06): the days a trainee submitted a sprint.
 * Feeds the streak and the sprint badge rules. growth-core never writes sprint data.
 */
export interface SprintSourcePort {
  submissionsOf(db: Db, userId: string): Promise<SprintSubmissionFact[]>;
}

/** Injection token for the SprintSourcePort provider. */
export const SPRINT_SOURCE = Symbol('SPRINT_SOURCE');
