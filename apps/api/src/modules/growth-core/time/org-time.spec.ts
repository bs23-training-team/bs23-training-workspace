import {
  addDays,
  isBeforeCutoff,
  isWeekend,
  orgToday,
  parseDay,
  toOrgLocal,
  weekEnd,
  weekStart,
} from './org-time.js';

// Org time is Asia/Dhaka: UTC+6, no daylight saving.
// 2026-11-16 is a Monday (checked against the calendar).

describe('toOrgLocal / orgToday', () => {
  it('moves a UTC instant to Dhaka local time', () => {
    const local = toOrgLocal(new Date('2026-11-18T03:30:00Z'));
    expect(local).toEqual({ day: '2026-11-18', hour: 9, minute: 30 });
  });

  it('rolls into the next day in Dhaka while UTC is still the previous day', () => {
    // 23:30 UTC on the 17th is 05:30 on the 18th in Dhaka.
    expect(orgToday(new Date('2026-11-17T23:30:00Z'))).toBe('2026-11-18');
  });

  it('stays on the same day just before Dhaka midnight', () => {
    // 17:59 UTC is 23:59 in Dhaka.
    expect(orgToday(new Date('2026-11-17T17:59:00Z'))).toBe('2026-11-17');
    // 18:00 UTC is 00:00 on the next day in Dhaka.
    expect(orgToday(new Date('2026-11-17T18:00:00Z'))).toBe('2026-11-18');
  });
});

describe('weekStart / weekEnd (Monday to Sunday)', () => {
  it('returns the Monday for a Wednesday', () => {
    expect(weekStart('2026-11-18')).toBe('2026-11-16');
    expect(weekEnd('2026-11-18')).toBe('2026-11-22');
  });

  it('keeps a Monday in its own week', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16');
  });

  it('puts Sunday in the week that started the Monday before', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
    expect(weekEnd('2026-11-22')).toBe('2026-11-22');
  });

  it('starts a new week on the next Monday', () => {
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekEnd('2026-11-23')).toBe('2026-11-29');
  });

  it('crosses a month and a year boundary', () => {
    expect(weekStart('2026-12-01')).toBe('2026-11-30');
    // 2027-01-01 is a Friday; its Monday is 2026-12-28.
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekEnd('2027-01-01')).toBe('2027-01-03');
  });
});

describe('isWeekend (Friday and Saturday)', () => {
  it('treats Friday and Saturday as weekend', () => {
    expect(isWeekend('2026-11-20')).toBe(true); // Friday
    expect(isWeekend('2026-11-21')).toBe(true); // Saturday
  });

  it('treats Sunday to Thursday as working days', () => {
    expect(isWeekend('2026-11-22')).toBe(false); // Sunday
    expect(isWeekend('2026-11-16')).toBe(false); // Monday
    expect(isWeekend('2026-11-19')).toBe(false); // Thursday
  });
});

describe('isBeforeCutoff (strictly before)', () => {
  // 10:00 in Dhaka is 04:00 UTC.
  const at = (hhmmUtc: string) => new Date(`2026-11-18T${hhmmUtc}:00Z`);

  it('is on time at 09:59 Dhaka', () => {
    expect(isBeforeCutoff(at('03:59'), '10:00')).toBe(true);
  });

  it('is NOT on time exactly at 10:00 Dhaka', () => {
    expect(isBeforeCutoff(at('04:00'), '10:00')).toBe(false);
  });

  it('is NOT on time at 10:01 Dhaka', () => {
    expect(isBeforeCutoff(at('04:01'), '10:00')).toBe(false);
  });

  it('follows a changed cutoff', () => {
    expect(isBeforeCutoff(at('04:30'), '11:00')).toBe(true);
    expect(isBeforeCutoff(at('05:00'), '11:00')).toBe(false);
  });

  it('judges the time on the Dhaka day, not the UTC day', () => {
    // 17:30 UTC on the 17th is 23:30 Dhaka on the 17th: after a 10:00 cutoff.
    expect(isBeforeCutoff(new Date('2026-11-17T17:30:00Z'), '10:00')).toBe(false);
    // 18:30 UTC on the 17th is 00:30 Dhaka on the 18th: before the cutoff.
    expect(isBeforeCutoff(new Date('2026-11-17T18:30:00Z'), '10:00')).toBe(true);
  });

  it('rejects a cutoff that is not HH:MM', () => {
    expect(() => isBeforeCutoff(at('03:00'), '9:5')).toThrow();
    expect(() => isBeforeCutoff(at('03:00'), '25:00')).toThrow();
    expect(() => isBeforeCutoff(at('03:00'), '10:60')).toThrow();
    expect(() => isBeforeCutoff(at('03:00'), '')).toThrow();
  });
});

describe('addDays / parseDay', () => {
  it('adds and subtracts calendar days', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-16', -1)).toBe('2026-11-15');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('parses a day to UTC midnight, the value a @db.Date column holds', () => {
    expect(parseDay('2026-11-18').toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });

  it('rejects an invalid day string', () => {
    expect(() => parseDay('2026-13-01')).toThrow();
    expect(() => parseDay('2026-02-30')).toThrow();
    expect(() => parseDay('18-11-2026')).toThrow();
  });
});
