import {
  addDays,
  cutoffMinutes,
  isBeforeCutoff,
  isDayString,
  isMonday,
  isReportVacationDay,
  isWeekend,
  orgToday,
  parseDay,
  previousDaySkippingWeekend,
  reportWeekDays,
  reportWeekEnd,
  reportWeekStart,
  toOrgLocal,
  weekDays,
  weekEnd,
  weekStart,
} from './org-time.js';

describe('org-time', () => {
  describe('parseDay', () => {
    it('reads a day as UTC midnight', () => {
      expect(parseDay('2026-11-23').toISOString()).toBe('2026-11-23T00:00:00.000Z');
    });

    it('refuses a malformed day', () => {
      expect(() => parseDay('23-11-2026')).toThrow(/expected YYYY-MM-DD/);
      expect(() => parseDay('2026-11-23T00:00:00Z')).toThrow(/expected YYYY-MM-DD/);
      expect(() => parseDay('')).toThrow();
    });

    it('refuses a day that is not a real date', () => {
      expect(() => parseDay('2026-02-30')).toThrow(/not a real calendar date/);
      expect(() => parseDay('2026-13-01')).toThrow(/not a real calendar date/);
    });
  });

  describe('isDayString', () => {
    it('accepts a real day', () => {
      expect(isDayString('2026-11-23')).toBe(true);
    });

    it('refuses anything else', () => {
      expect(isDayString('2026-02-30')).toBe(false);
      expect(isDayString('nope')).toBe(false);
      expect(isDayString(20261123)).toBe(false);
      expect(isDayString(undefined)).toBe(false);
    });
  });

  describe('toOrgLocal and orgToday', () => {
    it('reads a UTC instant as Dhaka local time', () => {
      // 2026-11-23T18:30:00Z is 2026-11-24 00:30 in Dhaka (UTC+6).
      expect(toOrgLocal(new Date('2026-11-23T18:30:00Z'))).toEqual({
        day: '2026-11-24',
        hour: 0,
        minute: 30,
        second: 0,
      });
    });

    it('gives the org-local day, not the UTC day', () => {
      expect(orgToday(new Date('2026-11-23T18:30:00Z'))).toBe('2026-11-24');
      expect(orgToday(new Date('2026-11-23T17:59:59Z'))).toBe('2026-11-23');
    });

    it('gives the org-local day at a moment that is still the previous day in UTC', () => {
      // 2026-11-23T20:00:00Z is already the 23rd in UTC but is 02:00 on the 24th in Dhaka.
      const instant = new Date('2026-11-23T20:00:00Z');
      expect(instant.getUTCDate()).toBe(23);
      expect(orgToday(instant)).toBe('2026-11-24');
    });

    it('gives the org-local day at a moment that is the previous day in Dhaka only', () => {
      // 2026-11-23T01:00:00Z is the 23rd in UTC and 07:00 on the 23rd in Dhaka.
      const instant = new Date('2026-11-23T01:00:00Z');
      expect(instant.getUTCDate()).toBe(23);
      expect(orgToday(instant)).toBe('2026-11-23');
    });
  });

  describe('addDays', () => {
    it('moves forward and back', () => {
      expect(addDays('2026-11-23', 1)).toBe('2026-11-24');
      expect(addDays('2026-11-23', -1)).toBe('2026-11-22');
    });

    it('crosses a month and a year boundary', () => {
      expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
      expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    });
  });

  describe('the sprint week', () => {
    it('starts on Monday and ends on Sunday', () => {
      expect(weekStart('2026-11-23')).toBe('2026-11-23'); // a Monday
      expect(weekEnd('2026-11-23')).toBe('2026-11-29'); // the Sunday
    });

    it('finds the same week from any day inside it', () => {
      expect(weekStart('2026-11-25')).toBe('2026-11-23'); // Wednesday
      expect(weekStart('2026-11-27')).toBe('2026-11-23'); // Friday
      expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sunday
    });

    it('puts the previous week before Monday', () => {
      expect(weekStart('2026-11-22')).toBe('2026-11-16'); // the Sunday before
      expect(weekStart('2026-11-30')).toBe('2026-11-30'); // the next Monday
    });

    it('lists the seven days Monday first', () => {
      expect(weekDays('2026-11-25')).toEqual([
        '2026-11-23',
        '2026-11-24',
        '2026-11-25',
        '2026-11-26',
        '2026-11-27',
        '2026-11-28',
        '2026-11-29',
      ]);
    });

    it('knows Monday', () => {
      expect(isMonday('2026-11-23')).toBe(true);
      expect(isMonday('2026-11-24')).toBe(false);
      expect(isMonday('2026-11-29')).toBe(false); // Sunday is not a Monday
    });
  });

  describe('the weekend', () => {
    it('is Friday and Saturday', () => {
      expect(isWeekend('2026-11-27')).toBe(true); // Friday
      expect(isWeekend('2026-11-28')).toBe(true); // Saturday
    });

    it('is not Sunday: Sunday is the last working day of the sprint week', () => {
      expect(isWeekend('2026-11-29')).toBe(false); // Sunday
      expect(isWeekend('2026-11-23')).toBe(false); // Monday
      expect(isWeekend('2026-11-26')).toBe(false); // Thursday
    });
  });

  // ---------------------------------------------------------------------------
  // The report week: Sunday to Friday, with only Saturday off.
  //
  // This is a DIFFERENT calendar from the sprint week above. The sprint week (Monday to
  // Sunday, Friday and Saturday off) is untouched — only the report window moved.
  // ---------------------------------------------------------------------------

  describe('the report week', () => {
    it('starts on the Sunday of the week that contains the day', () => {
      expect(reportWeekStart('2026-11-22')).toBe('2026-11-22'); // Sunday
      expect(reportWeekStart('2026-11-23')).toBe('2026-11-22'); // Monday
      expect(reportWeekStart('2026-11-26')).toBe('2026-11-22'); // Thursday
      expect(reportWeekStart('2026-11-27')).toBe('2026-11-22'); // Friday
    });

    it('puts a Saturday in the week that started the day before it', () => {
      expect(reportWeekStart('2026-11-21')).toBe('2026-11-15'); // Saturday
    });

    it('ends on the Friday', () => {
      expect(reportWeekEnd('2026-11-22')).toBe('2026-11-27'); // Sunday -> Friday
      expect(reportWeekEnd('2026-11-23')).toBe('2026-11-27'); // Monday -> Friday
      expect(reportWeekEnd('2026-11-21')).toBe('2026-11-20'); // Saturday -> the Friday before
    });

    it('has six active days, Sunday to Friday', () => {
      expect(reportWeekDays('2026-11-23')).toEqual([
        '2026-11-22', // Sunday
        '2026-11-23', // Monday
        '2026-11-24', // Tuesday
        '2026-11-25', // Wednesday
        '2026-11-26', // Thursday
        '2026-11-27', // Friday
      ]);
    });

    it('never includes a Saturday in its active days', () => {
      const days = reportWeekDays('2026-11-23');
      expect(days).not.toContain('2026-11-21');
      expect(days).not.toContain('2026-11-28');
    });

    it('knows Saturday is the one vacation day', () => {
      expect(isReportVacationDay('2026-11-21')).toBe(true); // Saturday
      expect(isReportVacationDay('2026-11-28')).toBe(true); // Saturday
      expect(isReportVacationDay('2026-11-22')).toBe(false); // Sunday
      expect(isReportVacationDay('2026-11-23')).toBe(false); // Monday
      expect(isReportVacationDay('2026-11-27')).toBe(false); // Friday
    });

    it('is not the sprint week: the sprint week still starts on a Monday', () => {
      expect(weekStart('2026-11-23')).toBe('2026-11-23'); // Monday
      expect(weekEnd('2026-11-23')).toBe('2026-11-29'); // the Sunday
      expect(reportWeekStart('2026-11-23')).toBe('2026-11-22');
      expect(reportWeekEnd('2026-11-23')).toBe('2026-11-27');
    });

    it('keeps the sprint weekend as it was: Friday and Saturday', () => {
      expect(isWeekend('2026-11-27')).toBe(true); // Friday
      expect(isWeekend('2026-11-28')).toBe(true); // Saturday
      expect(isReportVacationDay('2026-11-27')).toBe(false); // Friday is a report day
    });
  });

  describe('previousDaySkippingWeekend', () => {    it('steps back one day normally', () => {
      expect(previousDaySkippingWeekend('2026-11-24')).toBe('2026-11-23'); // Tuesday -> Monday
      expect(previousDaySkippingWeekend('2026-11-27')).toBe('2026-11-26'); // Friday -> Thursday
    });

    it('skips Friday and Saturday', () => {
      // Sunday -> Friday and Saturday are the weekend -> Thursday
      expect(previousDaySkippingWeekend('2026-11-29')).toBe('2026-11-26');
      // Monday -> Sunday is a working day
      expect(previousDaySkippingWeekend('2026-11-30')).toBe('2026-11-29');
    });

    it('keeps stepping over a long weekend', () => {
      // Saturday -> Friday is a weekend day -> Thursday
      expect(previousDaySkippingWeekend('2026-11-28')).toBe('2026-11-26');
    });
  });

  describe('isBeforeCutoff', () => {
    // 2026-11-23T03:59:00Z is 09:59 in Dhaka.
    // 2026-11-23T04:00:00Z is 10:00 in Dhaka.
    // 2026-11-23T04:01:00Z is 10:01 in Dhaka.
    it('is on time before the cutoff', () => {
      expect(isBeforeCutoff(new Date('2026-11-23T03:59:00Z'), '10:00')).toBe(true);
    });

    it('is late exactly at the cutoff', () => {
      expect(isBeforeCutoff(new Date('2026-11-23T04:00:00Z'), '10:00')).toBe(false);
    });

    it('is late after the cutoff', () => {
      expect(isBeforeCutoff(new Date('2026-11-23T04:01:00Z'), '10:00')).toBe(false);
    });

    it('follows a different cutoff', () => {
      // 11:00 local is 05:00 UTC
      expect(isBeforeCutoff(new Date('2026-11-23T04:59:00Z'), '11:00')).toBe(true);
      expect(isBeforeCutoff(new Date('2026-11-23T05:00:00Z'), '11:00')).toBe(false);
    });

    it('compares against the local day, not the UTC day', () => {
      // 2026-11-23T20:00:00Z is 02:00 on the 24th in Dhaka, so it is early on that day.
      expect(isBeforeCutoff(new Date('2026-11-23T20:00:00Z'), '10:00')).toBe(true);
      // 2026-11-23T05:00:00Z is 11:00 on the 23rd in Dhaka, so it is late on that day.
      expect(isBeforeCutoff(new Date('2026-11-23T05:00:00Z'), '10:00')).toBe(false);
    });

    it('refuses a cutoff that is not HH:MM', () => {
      expect(() => isBeforeCutoff(new Date(), '10:00:00')).toThrow(/expected HH:MM/);
      expect(() => isBeforeCutoff(new Date(), '25:00')).toThrow(/expected HH:MM/);
      expect(() => isBeforeCutoff(new Date(), '')).toThrow(/expected HH:MM/);
    });
  });

  describe('cutoffMinutes', () => {
    it('counts minutes after midnight', () => {
      expect(cutoffMinutes('00:00')).toBe(0);
      expect(cutoffMinutes('10:00')).toBe(600);
      expect(cutoffMinutes('09:59')).toBe(599);
      expect(cutoffMinutes('23:59')).toBe(1439);
    });

    it('refuses a bad format', () => {
      expect(() => cutoffMinutes('9:00')).toThrow(/expected HH:MM/);
      expect(() => cutoffMinutes('10:60')).toThrow(/expected HH:MM/);
    });
  });
});
