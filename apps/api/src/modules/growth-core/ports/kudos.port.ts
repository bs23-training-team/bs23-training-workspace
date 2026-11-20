import type { Db } from './db.js';

/**
 * Port (IF-04) to the engagement module (E10): how many different people sent this user a
 * kudos whose XP was AWARDED. Used by the KUDOS_DISTINCT_SENDERS badge rule so growth-core
 * never reads the Kudos table directly. Until engagement implements it, tests use
 * FakeKudosPort.
 */
export interface KudosPort {
  distinctApprovedSenders(db: Db, userId: string): Promise<number>;
}
