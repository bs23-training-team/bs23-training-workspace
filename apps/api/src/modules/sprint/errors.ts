/**
 * A rule of the sprint module was broken.
 *
 * `code` is a stable machine-readable name taken from the Daily Sprint SRS (section 9 and the
 * endpoint tables 5.3 / 5.4): `ALREADY_SUBMITTED`, `OWNER_INACTIVE`, `CATEGORY_OWNER_MISMATCH`,
 * `FORBIDDEN_SCOPE`, `WEEK_EXISTS`, `WEEK_START_NOT_MONDAY`, `CELL_CONFLICT`, `ALREADY_DECIDED`.
 * The generic codes (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`) come from
 * the shared API conventions (SRS 5.2).
 *
 * Services only throw this error; controllers never build a response by hand. The filter
 * (`http/sprint-error.filter.ts`) turns it into `{ error: { code, message, details? } }`.
 *
 * The shared API error format belongs to E01 and is not wired into this module yet, so this
 * envelope mirrors the one E09's `GrowthErrorFilter` produces (ASSUMPTIONS A13).
 */

/** Every error code this module can answer with. */
export type SprintErrorCode =
  // 401 — nobody signed in
  | 'UNAUTHENTICATED'
  // 403 — signed in, but not allowed
  | 'FORBIDDEN'
  | 'FORBIDDEN_SCOPE'
  // 404 — no such row, or not visible to this caller
  | 'NOT_FOUND'
  // 409 — the thing is already in that state
  | 'ALREADY_SUBMITTED'
  | 'ALREADY_DECIDED'
  | 'WEEK_EXISTS'
  | 'CELL_CONFLICT'
  // 422 — the request is understood but a rule refuses it
  | 'VALIDATION_ERROR'
  | 'OWNER_INACTIVE'
  | 'CATEGORY_OWNER_MISMATCH'
  | 'WEEK_START_NOT_MONDAY'
  | 'USER_ARCHIVED'
  // 500 — a setup problem, never the caller's fault
  | 'INTERNAL';

/** Optional extra information the UI needs, such as the current cell value on a conflict. */
export type SprintErrorDetails = Record<string, unknown>;

export class SprintError extends Error {
  constructor(
    readonly code: SprintErrorCode,
    message: string,
    readonly details?: SprintErrorDetails,
  ) {
    super(message);
    this.name = 'SprintError';
  }
}

/**
 * True when the database refused a write because of a unique index.
 *
 * Prisma raises `P2002` for a unique-constraint violation. The check is on the error's `code`
 * rather than on its class, the way E01's `isUniqueViolation` does it, so it works for the
 * error Prisma raises without depending on how that error is built.
 *
 * The sprint module uses it for the one-submission-per-day rule (PRD BR-06): the index on
 * `[userId, date]` refuses the second submission, and that refusal becomes a 409 rather than
 * a 500.
 */
export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  (error as { code?: string }).code === 'P2002';
