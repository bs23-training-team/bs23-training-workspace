import { GrowthError, parseDay, type DayString } from '../../growth-core/index.js';

export interface NewQuestInput {
  name: string;
  description: string;
  /** Whole number of 1 or more. */
  target: number;
  /** XP, a whole number of 0 or more. */
  reward: number;
  startDate: DayString;
  endDate: DayString;
}

const MAX_INT = 2 ** 31 - 1;

// The SRS names the three numbers: TARGET (1 or more), REWARD (0 or more), COUNT (0 or more).
const NUMBER_CODE = { target: 'TARGET', reward: 'REWARD', count: 'COUNT' } as const;

function whole(name: keyof typeof NUMBER_CODE, value: number, min: number): void {
  if (!Number.isInteger(value) || value < min || value > MAX_INT) {
    throw new GrowthError(NUMBER_CODE[name], `${name} must be a whole number of ${min} or more`);
  }
}

function day(name: string, value: string): void {
  try {
    parseDay(value);
  } catch {
    throw new GrowthError('VALIDATION', `${name} must be a real day written YYYY-MM-DD`);
  }
}

/**
 * Checks a new quest before it reaches the database (which also refuses a target below 1 and an
 * end date before the start). A quest may last any number of days, not only a week.
 */
export function validateNewQuest(input: NewQuestInput): NewQuestInput {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name === '' || description === '') {
    throw new GrowthError('VALIDATION', 'A quest needs a name and a description');
  }
  whole('target', input.target, 1);
  whole('reward', input.reward, 0);
  day('startDate', input.startDate);
  day('endDate', input.endDate);
  if (input.endDate < input.startDate) {
    throw new GrowthError('DATES', 'The end date cannot be before the start date');
  }
  return { ...input, name, description };
}

/** A recorded progress count: a whole number of 0 or more. */
export function validateCount(count: number): number {
  whole('count', count, 0);
  return count;
}
