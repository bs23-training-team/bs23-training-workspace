import { validateRuleEdit } from './xp-rules-input.js';

describe('validateRuleEdit', () => {
  it('accepts whole numbers of 0 or more, a decimal multiplier and an HH:MM cutoff', () => {
    expect(
      validateRuleEdit({ onTimeSprint: 30, kudos: 0, pmReviewMultiplier: 1.25, sprintCutoff: '09:30', streakMilestoneDays: 1 }),
    ).toEqual({ onTimeSprint: 30, kudos: 0, pmReviewMultiplier: 1.25, sprintCutoff: '09:30', streakMilestoneDays: 1 });
  });

  it('accepts a multiplier of 0 and whole-number multipliers', () => {
    expect(validateRuleEdit({ pmReviewMultiplier: 0 })).toEqual({ pmReviewMultiplier: 0 });
    expect(validateRuleEdit({ pmReviewMultiplier: 2 })).toEqual({ pmReviewMultiplier: 2 });
  });

  // SRS error table: a value that is not allowed (negative, not whole, bad cutoff) is RULE_VALUE (422); a value of the wrong
  // TYPE, an unknown rule name and an empty edit are ordinary invalid input, VALIDATION (400).
  it.each([
    ['a negative whole number', { onTimeSprint: -1 }, 'RULE_VALUE'],
    ['a fraction where a whole number is needed', { verifiedModule: 2.5 }, 'RULE_VALUE'],
    ['a number given as text', { finalAssessment: '40' }, 'VALIDATION'],
    ['not-a-number', { kudos: Number.NaN }, 'RULE_VALUE'],
    ['a streak milestone length of 0', { streakMilestoneDays: 0 }, 'RULE_VALUE'],
    ['a negative multiplier', { pmReviewMultiplier: -0.5 }, 'RULE_VALUE'],
    ['a multiplier with 3 decimals', { pmReviewMultiplier: 1.255 }, 'RULE_VALUE'],
    ['a multiplier too big for the column', { pmReviewMultiplier: 100 }, 'RULE_VALUE'],
    ['a multiplier given as text', { pmReviewMultiplier: '1.5' }, 'VALIDATION'],
    ['an unknown rule name', { luckyBonus: 5 }, 'VALIDATION'],
    ['an empty edit', {}, 'VALIDATION'],
  ])('refuses %s', (_label, patch, code) => {
    expect(() => validateRuleEdit(patch)).toThrowError(expect.objectContaining({ code }) as Error);
  });

  it.each(['24:00', '9:30', '10:60', '10.00', '', 'ten', '10:5'])('refuses the cutoff %j (RULE_VALUE)', (cutoff) => {
    expect(() => validateRuleEdit({ sprintCutoff: cutoff })).toThrowError(
      expect.objectContaining({ code: 'RULE_VALUE' }) as Error,
    );
  });

  it('refuses a cutoff that is not text (VALIDATION: wrong type)', () => {
    expect(() => validateRuleEdit({ sprintCutoff: 1000 })).toThrowError(expect.objectContaining({ code: 'VALIDATION' }) as Error);
  });

  it.each(['00:00', '10:00', '23:59'])('accepts the cutoff %s', (cutoff) => {
    expect(validateRuleEdit({ sprintCutoff: cutoff })).toEqual({ sprintCutoff: cutoff });
  });
});
