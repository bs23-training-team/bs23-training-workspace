import { diffLevelSets, levelFor, validateLevelSet } from './level-set.js';

const FOUR = [
  { name: 'Rookie', minXp: 0 },
  { name: 'Builder', minXp: 250 },
  { name: 'Pro', minXp: 600 },
  { name: 'Expert', minXp: 1200 },
];

describe('validateLevelSet', () => {
  it('accepts a good set and trims names', () => {
    expect(validateLevelSet([{ name: ' Rookie ', minXp: 0 }, { name: 'Builder', minXp: 100 }])).toEqual([
      { name: 'Rookie', minXp: 0 },
      { name: 'Builder', minXp: 100 },
    ]);
  });

  it('accepts a single level that starts at 0', () => {
    expect(validateLevelSet([{ name: 'Only', minXp: 0 }])).toHaveLength(1);
  });

  // SRS error table (422): LEVELS_EMPTY, LEVEL_NAME, LEVEL_NAME_DUP, LEVEL_XP, LEVEL_FIRST, LEVEL_ORDER.
  const bad: [string, { name: string; minXp: number }[], string][] = [
    ['an empty set', [], 'LEVELS_EMPTY'],
    ['a first level that does not start at 0', [{ name: 'A', minXp: 10 }, { name: 'B', minXp: 50 }], 'LEVEL_FIRST'],
    ['thresholds that do not increase', [{ name: 'A', minXp: 0 }, { name: 'B', minXp: 50 }, { name: 'C', minXp: 50 }], 'LEVEL_ORDER'],
    ['thresholds that go down', [{ name: 'A', minXp: 0 }, { name: 'B', minXp: 50 }, { name: 'C', minXp: 20 }], 'LEVEL_ORDER'],
    ['a blank name', [{ name: 'A', minXp: 0 }, { name: '  ', minXp: 50 }], 'LEVEL_NAME'],
    ['a duplicate name', [{ name: 'Pro', minXp: 0 }, { name: 'Pro', minXp: 50 }], 'LEVEL_NAME_DUP'],
    ['a duplicate name in another case', [{ name: 'Pro', minXp: 0 }, { name: ' pro ', minXp: 50 }], 'LEVEL_NAME_DUP'],
    ['a fractional threshold', [{ name: 'A', minXp: 0 }, { name: 'B', minXp: 10.5 }], 'LEVEL_XP'],
    ['a negative threshold', [{ name: 'A', minXp: -5 }], 'LEVEL_XP'],
  ];
  it.each(bad)('refuses %s', (_label, levels, code) => {
    expect(() => validateLevelSet(levels)).toThrowError(expect.objectContaining({ code }) as Error);
  });
});

describe('levelFor', () => {
  const active = FOUR.map((l, i) => ({ id: `l${i}`, ...l }));

  it('picks the highest level whose threshold is reached', () => {
    expect(levelFor(active, 0)?.name).toBe('Rookie');
    expect(levelFor(active, 249)?.name).toBe('Rookie');
    expect(levelFor(active, 250)?.name).toBe('Builder'); // exactly on the threshold
    expect(levelFor(active, 1199)?.name).toBe('Pro');
    expect(levelFor(active, 99999)?.name).toBe('Expert');
  });

  it('works whatever order the levels come in, and returns null for no levels', () => {
    expect(levelFor([...active].reverse(), 700)?.name).toBe('Pro');
    expect(levelFor([], 10)).toBeNull();
  });
});

describe('diffLevelSets', () => {
  const active = FOUR.map((l, i) => ({ id: `l${i}`, ...l }));

  it('touches nothing when the set is unchanged', () => {
    expect(diffLevelSets(active, FOUR)).toEqual({ retireIds: [], insert: [] });
  });

  it('retires and re-inserts only the changed level (changed threshold)', () => {
    const next = FOUR.map((l) => (l.name === 'Pro' ? { ...l, minXp: 700 } : l));
    expect(diffLevelSets(active, next)).toEqual({ retireIds: ['l2'], insert: [{ name: 'Pro', minXp: 700 }] });
  });

  it('treats a rename as retire plus insert', () => {
    const next = FOUR.map((l) => (l.name === 'Expert' ? { ...l, name: 'Master' } : l));
    expect(diffLevelSets(active, next)).toEqual({ retireIds: ['l3'], insert: [{ name: 'Master', minXp: 1200 }] });
  });

  it('retires removed levels and inserts added ones', () => {
    const next = [FOUR[0]!, FOUR[1]!, { name: 'Legend', minXp: 5000 }];
    const diff = diffLevelSets(active, next);
    expect(diff.retireIds.sort()).toEqual(['l2', 'l3']);
    expect(diff.insert).toEqual([{ name: 'Legend', minXp: 5000 }]);
  });
});
