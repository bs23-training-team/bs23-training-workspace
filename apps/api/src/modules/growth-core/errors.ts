/**
 * A rule of the growth-core module was broken. `code` is a stable machine-readable name
 * (for example NO_RULE, VALIDATION). Controllers map it to an HTTP status later; services
 * only throw it. The shared API error format belongs to E01 and is not wired yet.
 */
export class GrowthError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GrowthError';
  }
}
