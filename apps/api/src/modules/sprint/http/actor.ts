/**
 * Who is calling.
 *
 * **The rule:** the caller comes from `req.user` and from nothing else — not a header, not the
 * query, not the body, not the path. `req.user` is the one E01's `JwtAuthGuard` sets
 * (`apps/api/src/modules/identity/guards/jwt-auth.guard.ts`):
 *
 * ```ts
 * request.user = {
 *   sub: owner.account.id,      // Pm.pmId (e.g. "PM001") or User.userId (e.g. "BS23001")
 *   sid: session.id,
 *   workspaceId: owner.account.workspaceId,
 *   role: owner.account.role,   // 'PM' | 'USER'
 * };
 * ```
 *
 * `role` is the **login role**, not the resource type: E01 uses `'USER'` for non-PM accounts,
 * regardless of resource type (Trainee, Central RND, Industrial Attachment, SBU).
 * They all have the same sprint features (PRD 4), so one user actor covers all four. See
 * ASSUMPTIONS section 3.
 *
 * Without a usable `req.user` the answer is 401. A signed-in person in the wrong role for the
 * route gets 403 (E01's `RolesGuard`).
 */

import { SprintError } from '../errors.js';

/** The signed-in PM. */
export interface PmActor {
  role: 'PM';
  /** `Pm.pmId`, e.g. "PM001". */
  pmId: string;
  workspaceId: string;
}

/** The signed-in user, whatever their resource type. */
export interface UserActor {
  role: 'USER';
  /** `User.userId`, e.g. "BS23001". */
  userId: string;
  workspaceId: string;
}

export type SprintActor = PmActor | UserActor;

/**
 * What E01's guard puts on `req.user` (`AuthUserPayload`). Every field is optional here,
 * because this module trusts nothing it has not checked itself.
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
  actor?: SprintActor;
}

const present = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Turns `req.user` into the signed-in person, or null when there is nobody.
 *
 * - role 'PM' with a `sub` is the PM `sub`; role 'USER' with a `sub` is the user `sub`.
 * - Both need a `workspaceId`. A missing role, an unknown role or an empty id is nobody.
 * - `sid` is not needed: the guard has already checked the session is live.
 */
export function actorFromRequestUser(user: RequestUser | null | undefined): SprintActor | null {
  if (!user || typeof user !== 'object' || !present(user.sub) || !present(user.workspaceId)) return null;
  if (user.role === 'PM') return { role: 'PM', pmId: user.sub, workspaceId: user.workspaceId };
  if (user.role === 'USER') return { role: 'USER', userId: user.sub, workspaceId: user.workspaceId };
  return null;
}

/**
 * The PM id of a PM caller. Throws FORBIDDEN for anyone else: a second line of defence after
 * the role guard, so a service method can never read a pm id off a user actor.
 */
export function pmIdOf(actor: SprintActor): string {
  if (actor.role !== 'PM') throw new SprintError('FORBIDDEN', 'Your role cannot do this');
  return actor.pmId;
}

/** The user id of a user caller. Throws FORBIDDEN for anyone else. */
export function userIdOf(actor: SprintActor): string {
  if (actor.role !== 'USER') throw new SprintError('FORBIDDEN', 'Your role cannot do this');
  return actor.userId;
}

/**
 * The workspace of the caller. Every query is filtered by it, so a caller can never read or
 * write outside their own workspace (SRS 5.2).
 */
export function workspaceIdOf(actor: SprintActor): string {
  return actor.workspaceId;
}