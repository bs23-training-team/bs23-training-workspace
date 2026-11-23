import { randomBytes } from 'node:crypto';

/**
 * TEST ONLY. The HTTP routes of growth-core and engagement run E01's JwtAuthGuard, so a test that
 * starts those modules also starts E01's IdentityModule, which refuses to start without two
 * different JWT secrets of at least 32 characters. CI sets them; this fills them in with random
 * throwaway values when they are not set (for example in a fresh local .env), so the tests do not
 * depend on the developer's setup. It never overrides a value that is already set.
 */
export function ensureTestJwtSecrets(): void {
  process.env['JWT_ACCESS_SECRET'] ??= randomBytes(32).toString('hex');
  process.env['JWT_REFRESH_SECRET'] ??= randomBytes(32).toString('hex');
}
