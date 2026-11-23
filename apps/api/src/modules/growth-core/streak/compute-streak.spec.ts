import { computeStreak } from './compute-streak.js';

// November 2026 calendar used below (Dhaka weekend = Friday and Saturday):
//   Sun 15  Mon 16  Tue 17  Wed 18  Thu 19  Fri 20  Sat 21  Sun 22  Mon 23  Tue 24
const sub = (day: string, onTime = true) => ({ day: `2026-11-${day}`, onTime });
const day = (d: string) => `2026-11-${d}`;
const none = new Set<string>();

describe('computeStreak', () => {
  it('is 0 with no submissions', () => {
    expect(computeStreak([], none, day('17'))).toEqual({ current: 0, longest: 0, lastSubmissionDate: null });
  });

  it('counts consecutive working days with a submission', () => {
    const result = computeStreak([sub('15'), sub('16'), sub('17')], none, day('17'));
    expect(result).toEqual({ current: 3, longest: 3, lastSubmissionDate: day('17') });
  });

  it('does not break over the weekend (Friday and Saturday)', () => {
    const result = computeStreak([sub('18'), sub('19'), sub('22')], none, day('22'));
    expect(result.current).toBe(3);
  });

  it('does not count a submission made on a weekend day', () => {
    const result = computeStreak([sub('19'), sub('20')], none, day('21'));
    expect(result.current).toBe(1);
    expect(result.lastSubmissionDate).toBe(day('20')); // the last submission, even if it did not count
  });

  it('is broken by a missed working day, and the longest run is kept', () => {
    const result = computeStreak([sub('15'), sub('16'), sub('18'), sub('19')], none, day('19'));
    expect(result.current).toBe(2); // Wed + Thu, Tuesday was missed
    expect(result.longest).toBe(2);
  });

  it('is not broken by today when today has no submission yet', () => {
    expect(computeStreak([sub('15'), sub('16')], none, day('17')).current).toBe(2);
  });

  it('is broken once the missed day is in the past', () => {
    expect(computeStreak([sub('15'), sub('16')], none, day('18')).current).toBe(0); // Tuesday was missed
  });

  it('is not affected by today being a weekend day with no submission', () => {
    expect(computeStreak([sub('19')], none, day('20')).current).toBe(1);
  });

  it('keeps the longest earlier run after a break', () => {
    const subs = [sub('15'), sub('16'), sub('17'), sub('18'), sub('22'), sub('23')]; // Thu 19 missed
    expect(computeStreak(subs, none, day('23'))).toMatchObject({ current: 2, longest: 4 });
  });

  describe('frozen days (leave, holiday, PM freeze)', () => {
    it('neither count nor break: a frozen day with no submission keeps the streak', () => {
      const result = computeStreak([sub('16'), sub('18')], new Set([day('17')]), day('18'));
      expect(result.current).toBe(2);
    });

    it('do not count even when a submission was made on them', () => {
      const result = computeStreak([sub('16'), sub('17'), sub('18')], new Set([day('17')]), day('18'));
      expect(result.current).toBe(2);
    });

    it('the same gap WITHOUT a freeze (pending or declined leave) breaks the streak', () => {
      expect(computeStreak([sub('16'), sub('18')], none, day('18')).current).toBe(1);
    });

    it('a long freeze in the middle does not break a run', () => {
      const frozen = new Set([day('16'), day('17')]);
      expect(computeStreak([sub('15'), sub('18')], frozen, day('18')).current).toBe(2);
    });
  });

  describe('on-time mode (for the on-time streak badge)', () => {
    const subs = [sub('16'), sub('17', false), sub('18')];
    it('counts every submission by default', () => {
      expect(computeStreak(subs, none, day('18')).current).toBe(3);
    });
    it('counts only on-time submissions, so a late one breaks it', () => {
      expect(computeStreak(subs, none, day('18'), 'ON_TIME').current).toBe(1);
    });
  });

  it('ignores submissions after the as-of day and repeated submissions on one day', () => {
    const subs = [sub('16'), sub('16'), sub('17'), sub('18')];
    expect(computeStreak(subs, none, day('17')).current).toBe(2);
  });

  it('counts ten working days as 10', () => {
    // Nov 15..19 (5), weekend, 22..24 (3) plus 25, 26 -> 10 working days
    const days = ['15', '16', '17', '18', '19', '22', '23', '24', '25', '26'];
    expect(computeStreak(days.map((d) => sub(d)), none, day('26')).current).toBe(10);
  });
});
