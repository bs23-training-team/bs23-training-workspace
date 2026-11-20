import { autoEvidence, ruleMet, validateNewBadge } from './badge-rules.js';

const base = { name: 'Reliable', icon: '🔥', criteria: 'Show up every day' };

describe('validateNewBadge', () => {
  it('accepts a Special badge: MANUAL, no threshold (the rule can be left out)', () => {
    expect(validateNewBadge({ ...base, kind: 'SPECIAL' })).toEqual({
      ...base,
      kind: 'SPECIAL',
      ruleType: 'MANUAL',
      threshold: null,
    });
  });

  it('accepts a Behavioral badge with an automatic rule and a threshold of 1 or more', () => {
    expect(validateNewBadge({ ...base, kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 5 })).toMatchObject({
      kind: 'BEHAVIORAL',
      ruleType: 'SPRINT_STREAK',
      threshold: 5,
    });
    expect(validateNewBadge({ ...base, kind: 'BEHAVIORAL', ruleType: 'KUDOS_DISTINCT_SENDERS', threshold: 1 }).threshold).toBe(1);
  });

  it('trims the text fields', () => {
    expect(validateNewBadge({ name: '  Pro  ', icon: ' ⭐ ', criteria: ' x ', kind: 'SPECIAL' })).toMatchObject({
      name: 'Pro',
      icon: '⭐',
      criteria: 'x',
    });
  });

  const bad: [string, object][] = [
    ['a blank name', { ...base, name: '  ', kind: 'SPECIAL' }],
    ['a blank icon', { ...base, icon: '', kind: 'SPECIAL' }],
    ['blank criteria', { ...base, criteria: ' ', kind: 'SPECIAL' }],
    ['a Special badge with a threshold', { ...base, kind: 'SPECIAL', threshold: 3 }],
    ['a Special badge with an automatic rule', { ...base, kind: 'SPECIAL', ruleType: 'SPRINT_STREAK' }],
    ['a Behavioral badge with no rule', { ...base, kind: 'BEHAVIORAL', threshold: 3 }],
    ['a Behavioral badge with the MANUAL rule', { ...base, kind: 'BEHAVIORAL', ruleType: 'MANUAL', threshold: 3 }],
    ['a Behavioral badge with no threshold', { ...base, kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK' }],
    ['a Behavioral threshold of 0', { ...base, kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 0 }],
    ['a fractional threshold', { ...base, kind: 'BEHAVIORAL', ruleType: 'SPRINT_STREAK', threshold: 2.5 }],
    ['a Technical badge (dropped in v1)', { ...base, kind: 'TECHNICAL' }],
  ];
  it.each(bad)('refuses %s (VALIDATION)', (_label, input) => {
    expect(() => validateNewBadge(input as never)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }) as Error);
  });
});

describe('ruleMet', () => {
  const measures = { longestStreak: 5, longestOnTimeStreak: 3, distinctSenders: 4 };

  it('compares the right measure with the threshold, reaching it exactly counts', () => {
    expect(ruleMet('SPRINT_STREAK', 5, measures)).toBe(true);
    expect(ruleMet('SPRINT_STREAK', 6, measures)).toBe(false);
    expect(ruleMet('ON_TIME_SPRINT_STREAK', 3, measures)).toBe(true);
    expect(ruleMet('ON_TIME_SPRINT_STREAK', 4, measures)).toBe(false);
    expect(ruleMet('KUDOS_DISTINCT_SENDERS', 4, measures)).toBe(true);
    expect(ruleMet('KUDOS_DISTINCT_SENDERS', 5, measures)).toBe(false);
  });

  it('never meets the MANUAL rule or a missing threshold', () => {
    expect(ruleMet('MANUAL', 1, measures)).toBe(false);
    expect(ruleMet('SPRINT_STREAK', null, measures)).toBe(false);
  });
});

describe('autoEvidence', () => {
  it('writes a system sentence that names the rule and the threshold', () => {
    expect(autoEvidence('SPRINT_STREAK', 5)).toContain('5');
    expect(autoEvidence('ON_TIME_SPRINT_STREAK', 3)).toContain('on time');
    expect(autoEvidence('KUDOS_DISTINCT_SENDERS', 4)).toContain('different people');
    expect(autoEvidence('MANUAL', 1)).toContain('PM');
  });
});
