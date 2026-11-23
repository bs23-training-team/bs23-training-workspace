/**
 * The current time, injected so tests can control it.
 * Services take a ClockPort instead of calling `new Date()` themselves.
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
