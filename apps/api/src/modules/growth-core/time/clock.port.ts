/**
 * The current time, injected so tests can control it.
 * Services take a ClockPort instead of calling `new Date()` themselves.
 */
export interface ClockPort {
  now(): Date;
}

/** The real clock. */
export const systemClock: ClockPort = {
  now: () => new Date(),
};
