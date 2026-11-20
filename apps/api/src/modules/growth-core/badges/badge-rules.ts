import type { BadgeKind, BadgeRuleType } from '../../../generated/prisma/enums.js';
import { GrowthError } from '../errors.js';

export interface NewBadgeInput {
  name: string;
  /** An emoji. */
  icon: string;
  kind: BadgeKind;
  criteria: string;
  ruleType?: BadgeRuleType;
  threshold?: number | null;
}

export interface ValidBadge {
  name: string;
  icon: string;
  kind: BadgeKind;
  criteria: string;
  ruleType: BadgeRuleType;
  threshold: number | null;
}

/** The numbers a Behavioral rule is checked against. Only the ones a rule needs are filled in. */
export interface BadgeMeasures {
  /** Longest run of working days with a sprint submission. */
  longestStreak?: number;
  /** Longest run of working days with an on-time sprint. */
  longestOnTimeStreak?: number;
  /** Different people whose approved kudos to the user count (IF-04). */
  distinctSenders?: number;
}

const MAX_THRESHOLD = 2 ** 31 - 1;

/**
 * Checks a new badge before it reaches the database (the database also checks the kind/rule
 * combination). A Special badge is MANUAL with no threshold; a Behavioral badge has an
 * automatic rule and a whole threshold of 1 or more. There is no Technical kind in v1.
 */
export function validateNewBadge(input: NewBadgeInput): ValidBadge {
  const name = input.name.trim();
  const icon = input.icon.trim();
  const criteria = input.criteria.trim();
  if (name === '' || icon === '' || criteria === '') {
    throw new GrowthError('VALIDATION', 'A badge needs a name, an icon and its criteria');
  }
  const ruleType = input.ruleType ?? 'MANUAL';
  const threshold = input.threshold ?? null;

  if (input.kind === 'SPECIAL') {
    if (ruleType !== 'MANUAL' || threshold !== null) {
      throw new GrowthError('VALIDATION', 'A Special badge is awarded by a PM: no rule and no threshold');
    }
    return { name, icon, kind: 'SPECIAL', criteria, ruleType: 'MANUAL', threshold: null };
  }
  if (input.kind === 'BEHAVIORAL') {
    if (ruleType === 'MANUAL') {
      throw new GrowthError('VALIDATION', 'A Behavioral badge needs an automatic rule');
    }
    if (threshold === null || !Number.isInteger(threshold) || threshold < 1 || threshold > MAX_THRESHOLD) {
      throw new GrowthError('VALIDATION', 'A Behavioral badge needs a whole threshold of 1 or more');
    }
    return { name, icon, kind: 'BEHAVIORAL', criteria, ruleType, threshold };
  }
  throw new GrowthError('VALIDATION', 'A badge is either BEHAVIORAL or SPECIAL');
}

/** True when the measure for this rule has reached the threshold. MANUAL is never "met". */
export function ruleMet(ruleType: BadgeRuleType, threshold: number | null, measures: BadgeMeasures): boolean {
  if (threshold === null) {
    return false;
  }
  switch (ruleType) {
    case 'SPRINT_STREAK':
      return (measures.longestStreak ?? 0) >= threshold;
    case 'ON_TIME_SPRINT_STREAK':
      return (measures.longestOnTimeStreak ?? 0) >= threshold;
    case 'KUDOS_DISTINCT_SENDERS':
      return (measures.distinctSenders ?? 0) >= threshold;
    case 'MANUAL':
      return false;
  }
}

/** The system-written evidence stored on an automatic award. */
export function autoEvidence(ruleType: BadgeRuleType, threshold: number): string {
  switch (ruleType) {
    case 'SPRINT_STREAK':
      return `Automatic: a sprint streak of ${threshold} working days was reached.`;
    case 'ON_TIME_SPRINT_STREAK':
      return `Automatic: ${threshold} sprints in a row were submitted on time.`;
    case 'KUDOS_DISTINCT_SENDERS':
      return `Automatic: approved kudos received from ${threshold} different people.`;
    case 'MANUAL':
      return 'Awarded by a PM.';
  }
}
