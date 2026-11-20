import type { Actor, ActorResolver } from '../http/actor.js';

/**
 * TEST ONLY. Reads the caller from an `x-test-actor` header holding JSON such as
 * {"role":"PM","pmId":"PM001","workspaceId":"..."}. It exists so the HTTP routes can be tested
 * before real login exists. Never provide it in the real modules: they use a resolver that
 * refuses everyone until E01's auth is wired.
 */
export class HeaderActorResolver implements ActorResolver {
  async resolve(request: unknown): Promise<Actor | null> {
    const headers = (request as { headers?: Record<string, string | string[] | undefined> }).headers ?? {};
    const raw = headers['x-test-actor'];
    if (typeof raw !== 'string') return null;
    try {
      const actor = JSON.parse(raw) as Actor;
      return actor && (actor.role === 'PM' || actor.role === 'USER') ? actor : null;
    } catch {
      return null;
    }
  }
}
