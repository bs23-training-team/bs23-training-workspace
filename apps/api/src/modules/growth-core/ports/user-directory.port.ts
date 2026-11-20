import type { Db } from './db.js';

/**
 * Read-only check that a user exists in the workspace and is not archived. The User table is
 * owned by identity and directory (E01, E02); growth-core only reads it, through this port,
 * so tests can use a fake and the real lookup lives in one place.
 */
export interface UserDirectoryPort {
  isActiveUser(workspaceId: string, userId: string, db?: Db): Promise<boolean>;
}

/** Injection token for the UserDirectoryPort provider. */
export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
