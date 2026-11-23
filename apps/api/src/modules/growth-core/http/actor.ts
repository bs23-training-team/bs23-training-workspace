/**
 * Who is calling. The two gamification modules (growth-core and engagement) read the caller from
 * `req.user` ONLY (docs/architecture.md section 3.3, rule 7): never from a header, a query or a
 * request body, so an HTTP caller can never act as someone else.
 *
 * `req.user` is filled in by the auth guard of the identity module (E01). Until that exists nobody
 * has a `req.user`, so every route answers 401: nothing here is open by accident. Tests build
 * `req.user` themselves (see `ActorGuard` tests and the HTTP specs); no header is ever trusted.
 *
 * The shape of `req.user` is the same one the reports module (E08) already reads:
 * `{ role?, pmId?, userId?, workspaceId? }`.
 */

import { GrowthError } from '../errors.js';

export type Actor =
  | { role: 'PM'; pmId: string; workspaceId: string }
  | { role: 'USER'; userId: string; workspaceId: string };

export type Role = Actor['role'];

/** What the auth guard of E01 puts on `req.user`. Every field is optional because nothing is guaranteed yet. */
export interface RequestUser {
  role?: string;
  pmId?: string;
  userId?: string;
  workspaceId?: string;
}

/** The request as this module sees it: `user` comes from E01's guard, `actor` is set by our guard. */
export interface RequestWithActor {
  user?: RequestUser;
  actor?: Actor;
}

const present = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Turns `req.user` into the signed-in person, or null when there is nobody (the caller answers 401).
 *
 * - A PM needs `pmId` and `workspaceId`; a user needs `userId` and `workspaceId`.
 * - When `role` is given it decides ('PM' or 'USER'); an unknown role is nobody.
 * - When `role` is missing, exactly one of `pmId` / `userId` must be present: a user object that
 *   claims to be both is ambiguous and is refused rather than guessed.
 */
export function actorFromRequestUser(user: RequestUser | null | undefined): Actor | null {
  if (!user || typeof user !== 'object' || !present(user.workspaceId)) return null;
  const wantsPm = user.role === undefined ? present(user.pmId) && !present(user.userId) : user.role === 'PM';
  const wantsUser = user.role === undefined ? present(user.userId) && !present(user.pmId) : user.role === 'USER';
  if (wantsPm && present(user.pmId)) return { role: 'PM', pmId: user.pmId, workspaceId: user.workspaceId };
  if (wantsUser && present(user.userId)) return { role: 'USER', userId: user.userId, workspaceId: user.workspaceId };
  return null;
}

/** The PM id of a PM caller. Throws FORBIDDEN for anyone else (a second line of defence after the role guard). */
export function pmIdOf(actor: Actor): string {
  if (actor.role !== 'PM') throw new GrowthError('FORBIDDEN', 'Your role cannot do this');
  return actor.pmId;
}

/** The user id of a user caller. Throws FORBIDDEN for anyone else. */
export function userIdOf(actor: Actor): string {
  if (actor.role !== 'USER') throw new GrowthError('FORBIDDEN', 'Your role cannot do this');
  return actor.userId;
}
