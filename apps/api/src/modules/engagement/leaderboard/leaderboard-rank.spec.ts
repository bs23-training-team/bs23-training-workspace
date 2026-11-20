import {
  paginate,
  rankCandidates,
  toPeerRows,
  toPmRows,
  windowRange,
  type Candidate,
} from './leaderboard-rank.js';

const person = (userId: string, name: string, xp: number, extra: Partial<Candidate> = {}): Candidate => ({
  userId,
  name,
  xp,
  level: 'Rookie',
  hidden: false,
  ...extra,
});

describe('windowRange (org time, weeks start on Monday)', () => {
  it('weekly runs from this week\'s Monday to today', () => {
    expect(windowRange('weekly', '2026-11-18')).toEqual({ from: '2026-11-16', to: '2026-11-18' }); // Wednesday
    expect(windowRange('weekly', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-16' }); // Monday itself
    expect(windowRange('weekly', '2026-11-22')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // Sunday is still that week
    expect(windowRange('weekly', '2026-11-23').from).toBe('2026-11-23'); // the next Monday starts a new week
  });

  it('monthly is the last 30 days including today', () => {
    expect(windowRange('monthly', '2026-11-30')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(windowRange('monthly', '2026-12-05')).toEqual({ from: '2026-11-06', to: '2026-12-05' });
  });

  it('all time has no bounds', () => {
    expect(windowRange('all', '2026-11-18')).toEqual({});
  });
});

describe('rankCandidates', () => {
  it('ranks by XP, and ties share a rank (1, 2, 2, 4)', () => {
    const ranked = rankCandidates([person('a', 'Ann', 50), person('b', 'Bob', 80), person('c', 'Cy', 50), person('d', 'Di', 10)]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([['Bob', 1], ['Ann', 2], ['Cy', 2], ['Di', 4]]);
  });

  it('ranks a user with 0 XP', () => {
    const ranked = rankCandidates([person('a', 'Ann', 5), person('b', 'Bob', 0)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('keeps hidden users in the ranking, so nobody\'s rank shifts', () => {
    const ranked = rankCandidates([person('a', 'Ann', 90), person('b', 'Bob', 80, { hidden: true }), person('c', 'Cy', 70)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('orders a tie by name but puts hidden users last, so the order never reveals a hidden name', () => {
    const ranked = rankCandidates([
      person('z', 'Zed', 50),
      person('h', 'Aaron', 50, { hidden: true }), // would sort first by name
      person('a', 'Amy', 50),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'z', 'h']);
  });
});

describe('rankCandidates: a fully equal tie still has a stable order', () => {
  it('two people with the same XP and the same name are ordered by user id', () => {
    const ranked = rankCandidates([person('b', 'Sam', 10), person('a', 'Sam', 10)]);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('two hidden people with the same XP are ordered by user id, never by name', () => {
    const ranked = rankCandidates([
      person('b', 'Aaron', 10, { hidden: true }),
      person('a', 'Zed', 10, { hidden: true }),
    ]);
    expect(ranked.map((r) => r.userId)).toEqual(['a', 'b']);
  });
});

describe('what each viewer sees', () => {
  const ranked = rankCandidates([
    person('me', 'Me Myself', 90, { level: 'Pro' }),
    person('hid', 'Secret Person', 80, { hidden: true, level: 'Builder' }),
    person('pub', 'Public Pat', 70, { level: 'Rookie' }),
  ]);

  it('a peer sees other people by name and level, themself as "You", and a hidden user as "Hidden user"', () => {
    expect(toPeerRows(ranked, 'me')).toEqual([
      { rank: 1, name: 'You', xp: 90, level: 'Pro', isYou: true },
      { rank: 2, name: 'Hidden user', xp: 80 },
      { rank: 3, name: 'Public Pat', xp: 70, level: 'Rookie' },
    ]);
  });

  it('PRIVACY: the whole payload for a peer never contains the hidden user\'s id, name or level, nor any user id', () => {
    const payload = JSON.stringify(toPeerRows(ranked, 'pub'));
    expect(payload).not.toContain('hid');
    expect(payload).not.toContain('Secret Person');
    expect(payload).not.toContain('Builder');
    expect(payload).not.toContain('userId');
    expect(payload).not.toContain('email');
    expect(payload).toContain('Hidden user');
    expect(payload).toContain('"xp":80'); // the XP and rank stay, so ranks do not shift
  });

  it('a hidden user sees themself as "You" with their own level and rank', () => {
    const rows = toPeerRows(ranked, 'hid');
    expect(rows[1]).toEqual({ rank: 2, name: 'You', xp: 80, level: 'Builder', isYou: true });
    expect(JSON.stringify(rows)).not.toContain('Secret Person');
  });

  it('a PM sees everyone by name, with hidden users tagged', () => {
    expect(toPmRows(ranked)).toEqual([
      { userId: 'me', rank: 1, name: 'Me Myself', xp: 90, level: 'Pro', hiddenFromPeers: false },
      { userId: 'hid', rank: 2, name: 'Secret Person', xp: 80, level: 'Builder', hiddenFromPeers: true },
      { userId: 'pub', rank: 3, name: 'Public Pat', xp: 70, level: 'Rookie', hiddenFromPeers: false },
    ]);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 7 }, (_, i) => i);

  it('returns everything and no cursor when it fits', () => {
    expect(paginate(rows, null, 10)).toEqual({ rows, nextCursor: null });
  });

  it('pages with a cursor, and the last page has no cursor', () => {
    const first = paginate(rows, null, 3);
    expect(first).toEqual({ rows: [0, 1, 2], nextCursor: '3' });
    const second = paginate(rows, first.nextCursor, 3);
    expect(second).toEqual({ rows: [3, 4, 5], nextCursor: '6' });
    expect(paginate(rows, second.nextCursor, 3)).toEqual({ rows: [6], nextCursor: null });
  });

  it('caps a page at 100 rows by default', () => {
    expect(paginate(Array.from({ length: 150 }, (_, i) => i), null).rows).toHaveLength(100);
  });

  it('refuses a cursor that is not a position (VALIDATION)', () => {
    expect(() => paginate(rows, 'abc', 3)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }) as Error);
    expect(() => paginate(rows, '-1', 3)).toThrowError(expect.objectContaining({ code: 'VALIDATION' }) as Error);
  });
});
