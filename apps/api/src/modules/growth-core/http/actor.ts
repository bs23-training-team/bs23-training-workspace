/**
 * Who is calling. The two gamification modules (growth-core and engagement) read the caller from
 * here only, never from a request body or query, so an HTTP caller can never act as someone else.
 *
 * The real login belongs to the identity module (E01). Until it exists, `ACTOR_RESOLVER` is
 * provided by a stand-in that refuses everyone (401), so nothing here is open by accident.
 * E01 (or whoever wires auth) provides a real resolver under the same token; tests use
 * `testing/header-actor-resolver.ts`.
 */

import { GrowthError } from '../errors.js';

export type Actor =
  | { role: 'PM'; pmId: string; workspaceId: string }
  | { role: 'USER'; userId: string; workspaceId: string };

export type Role = Actor['role'];

/** Turns an incoming request into the signed-in person, or null when there is none. */
export interface ActorResolver {
  resolve(request: unknown): Promise<Actor | null>;
}

/** Injection token for the ActorResolver provider. */
export const ACTOR_RESOLVER = Symbol('ACTOR_RESOLVER');

/** The default until real auth exists: nobody is signed in, so every route answers 401. */
export class DenyAllActorResolver implements ActorResolver {
  async resolve(): Promise<Actor | null> {
    return null;
  }
}

/** The request after the guard has run. */
export interface RequestWithActor {
  actor?: Actor;
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
