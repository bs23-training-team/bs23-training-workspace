import { GrowthError } from '../errors.js';

/**
 * Small request readers. A controller checks only the SHAPE of what it receives (a string is a
 * string, a number is a number); the service then checks the rules (ranges, blank values).
 * Anything of the wrong shape is a 400 VALIDATION, never a 500.
 */

export type Body = Record<string, unknown>;

export function bodyOf(raw: unknown): Body {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new GrowthError('VALIDATION', 'The request body must be a JSON object');
  }
  return raw as Body;
}

const bad = (key: string, kind: string) => new GrowthError('VALIDATION', `${key} is required and must be ${kind}`);

export function str(body: Body, key: string): string {
  const value = body[key];
  if (typeof value !== 'string') throw bad(key, 'a string');
  return value;
}

export function optStr(body: Body, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw bad(key, 'a string');
  return value;
}

export function num(body: Body, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(key, 'a number');
  return value;
}

export function optNum(body: Body, key: string): number | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(key, 'a number');
  return value;
}

export function bool(body: Body, key: string): boolean {
  const value = body[key];
  if (typeof value !== 'boolean') throw bad(key, 'true or false');
  return value;
}

export function list(body: Body, key: string): unknown[] {
  const value = body[key];
  if (!Array.isArray(value)) throw bad(key, 'an array');
  return value;
}

/** One of the allowed values. */
export function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!allowed.includes(value as T)) {
    throw new GrowthError('VALIDATION', `${key} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/** A query-string value: absent is undefined, but an array (?a=1&a=2) is refused. */
export function query(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'string') throw new GrowthError('VALIDATION', 'A query parameter is not valid');
  return raw;
}
