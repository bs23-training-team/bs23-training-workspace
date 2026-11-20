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

  it.each([
    ['a negative whole number', { onTimeSprint: -1 }],
    ['a fraction where a whole number is needed', { verifiedModule: 2.5 }],
    ['a number given as text', { finalAssessment: '40' }],
    ['not-a-number', { kudos: Number.NaN }],
    ['a streak milestone length of 0', { streakMilestoneDays: 0 }],
    ['a negative multiplier', { pmReviewMultiplier: -0.5 }],
    ['a multiplier with 3 decimals', { pmReviewMultiplier: 1.255 }],
    ['a multiplier too big for the column', { pmReviewMultiplier: 100 }],
    ['an unknown rule name', { luckyBonus: 5 }],
    ['an empty edit', {}],
  ])('refuses %s (VALIDATION)', (_label, patch) => {
    expect(() => validateRuleEdit(patch)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }) as Error);
  });

  it.each(['24:00', '9:30', '10:60', '10.00', '', 'ten', '10:5', 1000])('refuses the cutoff %j', (cutoff) => {
    expect(() => validateRuleEdit({ sprintCutoff: cutoff })).toThrowError(
      expect.objectContaining({ code: 'VALIDATION' }) as Error,
    );
  });

  it.each(['00:00', '10:00', '23:59'])('accepts the cutoff %s', (cutoff) => {
    expect(validateRuleEdit({ sprintCutoff: cutoff })).toEqual({ sprintCutoff: cutoff });
  });
});
