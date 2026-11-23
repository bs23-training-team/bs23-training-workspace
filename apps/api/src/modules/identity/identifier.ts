/**
 * Login identifier rules (E01).
 *
 * One login endpoint serves both roles. The identifier decides which table
 * is looked up (agreed E01 rule, E01 SRS 2.1 / 5.1 / 6):
 *   - contains "@"  -> a PM signs in with the registered email (normalised to
 *                      lower case) and is looked up in `Pm`
 *   - anything else -> a user signs in with the assigned Trainee ID, which is
 *                      `User.userId` (e.g. "BS23001", ADR 0003), and is looked
 *                      up in `User`
 * A user's email is never a login identifier, and a PM ID is not one either.
 *
 * Trainee IDs have a fixed upper-case format (ADR 0003), so the value is
 * trimmed and upper-cased: "bs23001" and "BS23001" are the same ID.
 *
 * Pure functions (no Nest, no database) so they are easy to unit test.
 */

import { normalizeEmail } from './email.js';

export type LoginIdentifier =
    | { kind: 'EMAIL'; value: string }
    | { kind: 'TRAINEE_ID'; value: string };

export function classifyIdentifier(raw: string): LoginIdentifier {
    const value = raw.trim();

    return value.includes('@')
        ? { kind: 'EMAIL', value: normalizeEmail(value) }
        : { kind: 'TRAINEE_ID', value: value.toUpperCase() };
}
