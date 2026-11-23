import type { Tx } from './ports/db.js';

/**
 * Serialises writes for one user. Takes a Postgres advisory lock that is held until the
 * surrounding transaction ends, so two requests that change the same user's XP cannot
 * interleave (a double decision, a negative total). Must be called inside a transaction.
 */
export async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`growth:user:${userId}`}))`;
}

/** Serialises saves of one workspace's level set (same rules as lockUser). */
export async function lockLevels(tx: Tx, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`growth:levels:${workspaceId}`}))`;
}
