import { validateCount, validateNewQuest } from './quest-input.js';

const good = { name: 'Send 5 kudos', description: 'Recognise your teammates', target: 5, reward: 30, startDate: '2026-11-16', endDate: '2026-11-22' };

describe('validateNewQuest', () => {
  it('accepts a good quest and trims the text', () => {
    expect(validateNewQuest({ ...good, name: '  Send 5 kudos ', description: ' x ' })).toEqual({ ...good, name: 'Send 5 kudos', description: 'x' });
  });

  it('accepts a reward of 0 and a quest that starts and ends on the same day', () => {
    expect(validateNewQuest({ ...good, reward: 0, endDate: '2026-11-16' }).reward).toBe(0);
  });

  it('accepts a quest longer than a week', () => {
    expect(validateNewQuest({ ...good, endDate: '2026-12-31' }).endDate).toBe('2026-12-31');
  });

  // SRS error table (422): TARGET (1 or more), REWARD (0 or more); text and dates that are not valid stay VALIDATION (400).
  it.each([
    ['a blank name', { name: '  ' }, 'VALIDATION'],
    ['a blank description', { description: '' }, 'VALIDATION'],
    ['a target of 0', { target: 0 }, 'TARGET'],
    ['a negative target', { target: -1 }, 'TARGET'],
    ['a fractional target', { target: 2.5 }, 'TARGET'],
    ['a negative reward', { reward: -5 }, 'REWARD'],
    ['a fractional reward', { reward: 1.5 }, 'REWARD'],
    ['a start date that is not a real day', { startDate: '2026-02-30' }, 'VALIDATION'],
    ['an end date written wrongly', { endDate: '22/11/2026' }, 'VALIDATION'],
  ])('refuses %s', (_label, change, code) => {
    expect(() => validateNewQuest({ ...good, ...change })).toThrowError(expect.objectContaining({ code }) as Error);
  });

  it('refuses an end date before the start date (DATES)', () => {
    expect(() => validateNewQuest({ ...good, startDate: '2026-11-20', endDate: '2026-11-19' })).toThrowError(
      expect.objectContaining({ code: 'DATES' }) as Error,
    );
  });
});

describe('validateCount', () => {
  it('accepts 0 and whole numbers', () => {
    expect(validateCount(0)).toBe(0);
    expect(validateCount(12)).toBe(12);
  });
  it.each([-1, 1.5, Number.NaN, 2 ** 31])('refuses %s (COUNT)', (count) => {
    expect(() => validateCount(count)).toThrowError(expect.objectContaining({ code: 'COUNT' }) as Error);
  });
});
