/**
 * The current time, injected so tests can control it.
 *
 * Services take a `ClockPort` instead of calling `new Date()` themselves. The sprint module
 * needs this because the on-time flag is decided at the moment of submission (PRD BR-05) and
 * the no-reply job looks a day back (DS-09.1); both must be testable without waiting.
 */
export interface ClockPort {
  now(): Date;
}

/** Nest injection token for the clock. */
export const CLOCK = Symbol('CLOCK');

/** The real clock. */
export const systemClock: ClockPort = {
  now: () => new Date(),
};
