import { cooldownActive, FLAG_CAP, FLAG_SUSPICIOUS, kudosOutcome, sameWeek } from './kudos-rules.js';

// November 2026: Sun 15, Mon 16 ... Sat 21, Sun 22, Mon 23 (weeks start on Monday)

describe('kudosOutcome', () => {
  const base = { baseAmount: 5, weeklyCap: 15 };

  it('pays the rule amount as PENDING when nothing is wrong', () => {
    expect(kudosOutcome({ ...base, receivedThisWeek: 0, mutual: false })).toEqual({ amount: 5, flag: null, held: false });
  });

  it('pays up to the cap exactly', () => {
    expect(kudosOutcome({ ...base, receivedThisWeek: 10, mutual: false }).amount).toBe(5); // 10 + 5 = 15, not over
  });

  it('pays 0, never partial, when it would go over the cap', () => {
    expect(kudosOutcome({ baseAmount: 5, weeklyCap: 12, receivedThisWeek: 10, mutual: false })).toEqual({
      amount: 0, // not 2
      flag: FLAG_CAP,
      held: false,
    });
  });

  it('holds a mutual kudos with the suspicious flag', () => {
    expect(kudosOutcome({ ...base, receivedThisWeek: 0, mutual: true })).toEqual({ amount: 5, flag: FLAG_SUSPICIOUS, held: true });
  });

  it('is flagged suspicious (not "cap reached") when mutual AND over the cap, and still pays 0', () => {
    expect(kudosOutcome({ baseAmount: 5, weeklyCap: 12, receivedThisWeek: 10, mutual: true })).toEqual({
      amount: 0,
      flag: FLAG_SUSPICIOUS,
      held: true,
    });
  });

  it('a cap of 0 pays nothing at all', () => {
    expect(kudosOutcome({ baseAmount: 5, weeklyCap: 0, receivedThisWeek: 0, mutual: false }).amount).toBe(0);
  });
});

describe('cooldownActive', () => {
  it('is off when the sender never sent to this person', () => {
    expect(cooldownActive(null, '2026-11-23', 7)).toBe(false);
  });
  it('blocks a second kudos inside the cooldown', () => {
    expect(cooldownActive('2026-11-17', '2026-11-23', 7)).toBe(true); // 6 days ago
    expect(cooldownActive('2026-11-23', '2026-11-23', 7)).toBe(true); // the same day
  });
  it('allows it again once the full cooldown has passed (7 days later)', () => {
    expect(cooldownActive('2026-11-16', '2026-11-23', 7)).toBe(false);
  });
  it('a cooldown of 0 days never blocks', () => {
    expect(cooldownActive('2026-11-23', '2026-11-23', 0)).toBe(false);
  });
});

describe('sameWeek (Monday to Sunday)', () => {
  it('Monday and the following Sunday are the same week', () => {
    expect(sameWeek('2026-11-16', '2026-11-22')).toBe(true);
  });
  it('Sunday and the next Monday are NOT the same week', () => {
    expect(sameWeek('2026-11-22', '2026-11-23')).toBe(false);
  });
  it('is true for the same day and for midweek days', () => {
    expect(sameWeek('2026-11-18', '2026-11-18')).toBe(true);
    expect(sameWeek('2026-11-17', '2026-11-20')).toBe(true);
  });
});
