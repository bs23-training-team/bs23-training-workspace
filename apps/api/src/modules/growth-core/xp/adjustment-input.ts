import { GrowthError } from '../errors.js';

const MAX_AMOUNT = 2 ** 31 - 1; // XpEvent.amount is a 32-bit integer column

/**
 * Checks a PM's adjustment before anything touches the database: a non-zero whole number
 * (positive or negative) and a reason. Returns the cleaned values.
 */
export function validateAdjustment(amount: number, reason: string): { amount: number; reason: string } {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > MAX_AMOUNT) {
    throw new GrowthError('AMOUNT', 'An adjustment must be a non-zero whole number');
  }
  const cleaned = reason.trim();
  if (cleaned === '') {
    throw new GrowthError('REASON_REQUIRED', 'A reason is required.');
  }
  return { amount, reason: cleaned };
}
