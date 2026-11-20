import { GrowthError } from '../errors.js';
import { validateAdjustment } from './adjustment-input.js';

describe('validateAdjustment', () => {
  it('accepts a positive or negative whole number and trims the reason', () => {
    expect(validateAdjustment(25, '  Fixed a wrong award ')).toEqual({ amount: 25, reason: 'Fixed a wrong award' });
    expect(validateAdjustment(-7, 'Duplicate credit')).toEqual({ amount: -7, reason: 'Duplicate credit' });
  });

  it.each([0, 1.5, -0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, -(2 ** 31) - 1])(
    'refuses %s as an amount (AMOUNT)',
    (amount) => {
      expect(() => validateAdjustment(amount, 'Reason')).toThrowError(
        expect.objectContaining({ code: 'AMOUNT' }) as GrowthError,
      );
    },
  );

  it.each(['', '   ', '\n\t'])('refuses a blank reason %j (REASON_REQUIRED)', (reason) => {
    expect(() => validateAdjustment(5, reason)).toThrowError(
      expect.objectContaining({ code: 'REASON_REQUIRED' }) as GrowthError,
    );
  });
});
