import { GrowthError } from '../errors.js';

export interface LevelInput {
  name: string;
  minXp: number;
}

export interface ActiveLevel extends LevelInput {
  id: string;
}

const MAX_XP = 2 ** 31 - 1; // Level.minXp is a 32-bit integer column

/**
 * Checks a level set the PM wants to save, as one set: the first level starts at 0, thresholds
 * strictly increase in the given order, every name is non-blank and unique (ignoring case).
 * Returns the set with names trimmed.
 */
export function validateLevelSet(levels: LevelInput[]): LevelInput[] {
  if (levels.length === 0) {
    throw new GrowthError('VALIDATION', 'There must be at least one level');
  }
  const cleaned = levels.map((l) => ({ name: l.name.trim(), minXp: l.minXp }));
  const seen = new Set<string>();
  cleaned.forEach((level, i) => {
    if (level.name === '') {
      throw new GrowthError('VALIDATION', 'A level name must not be blank');
    }
    if (!Number.isInteger(level.minXp) || level.minXp < 0 || level.minXp > MAX_XP) {
      throw new GrowthError('VALIDATION', `Level "${level.name}" needs a whole-number threshold of 0 or more`);
    }
    const lowered = level.name.toLowerCase();
    if (seen.has(lowered)) {
      throw new GrowthError('VALIDATION', `Two levels are named "${level.name}"`);
    }
    seen.add(lowered);
    if (i === 0 && level.minXp !== 0) {
      throw new GrowthError('VALIDATION', 'The first level must start at 0 XP');
    }
    const previous = cleaned[i - 1];
    if (previous && level.minXp <= previous.minXp) {
      throw new GrowthError('VALIDATION', 'Level thresholds must strictly increase');
    }
  });
  return cleaned;
}

/** The level for an XP total: the highest level whose threshold is reached. Null for no levels. */
export function levelFor<T extends LevelInput>(levels: T[], totalXp: number): T | null {
  let best: T | null = null;
  for (const level of levels) {
    if (level.minXp <= totalXp && (best === null || level.minXp > best.minXp)) {
      best = level;
    }
  }
  return best;
}

/**
 * What saving `next` over the `active` set changes. A level is unchanged when an active level
 * has the same name and threshold: it keeps its row (and id). Everything else is retired, and
 * the new versions are inserted. The caller must retire BEFORE it inserts, because two active
 * levels may not share a name or threshold.
 */
export function diffLevelSets(
  active: ActiveLevel[],
  next: LevelInput[],
): { retireIds: string[]; insert: LevelInput[] } {
  const sameAs = (a: LevelInput, b: LevelInput) => a.name === b.name && a.minXp === b.minXp;
  const retireIds = active.filter((a) => !next.some((n) => sameAs(a, n))).map((a) => a.id);
  const insert = next.filter((n) => !active.some((a) => sameAs(a, n)));
  return { retireIds, insert };
}
