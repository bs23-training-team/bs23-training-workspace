/**
 * Who is calling. The two gamification modules (growth-core and engagement) read the caller from
 * `req.user` ONLY (docs/architecture.md section 3.3, rule 7): never from a header, a query or a
 * request body, so an HTTP caller can never act as someone else.
 *
 * `req.user` is set by E01's `JwtAuthGuard` after it has checked the access token and the live
 * session (apps/api/src/modules/identity/README.md): `{ sub, sid, workspaceId, role }`, where `sub`
 * is the account id (`Pm.pmId` for a PM, `User.userId` for a user) and `role` is 'PM' or 'USER'
 * (every `User`, whatever their resource type, signs in as 'USER'). Our routes run that guard
 * first, then `ActorGuard`, which turns `req.user` into an `Actor`. Without a usable `req.user` the
 * answer is 401. Tests set `req.user` themselves; no header is ever trusted.
 */

import { GrowthError } from '../errors.js';

export type Actor =
  | { role: 'PM'; pmId: string; workspaceId: string }
  | { role: 'USER'; userId: string; workspaceId: string };

export type Role = Actor['role'];

/**
 * What E01's guard puts on `req.user` (identity `AuthUserPayload`). Every field is optional here
 * because this module trusts nothing it has not checked.
 */
export interface RequestUser {
  /** Account id: `Pm.pmId` for a PM, `User.userId` for a user. */
  sub?: string;
  /** Id of the live session the access token belongs to. */
  sid?: string;
  workspaceId?: string;
  /** 'PM' or 'USER'. */
  role?: string;
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
 * - role 'PM' with a `sub` is the PM `sub`; role 'USER' with a `sub` is the user `sub`.
 * - Both need a `workspaceId`. A missing role, an unknown role or an empty id is nobody.
 */
export function actorFromRequestUser(user: RequestUser | null | undefined): Actor | null {
  if (!user || typeof user !== 'object' || !present(user.sub) || !present(user.workspaceId)) return null;
  if (user.role === 'PM') return { role: 'PM', pmId: user.sub, workspaceId: user.workspaceId };
  if (user.role === 'USER') return { role: 'USER', userId: user.sub, workspaceId: user.workspaceId };
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
