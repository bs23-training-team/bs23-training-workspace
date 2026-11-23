import { GrowthError } from '../errors.js';

/** A PM's edit of the XP rules: any subset of these fields. */
export interface XpRuleEdit {
  verifiedModule?: number;
  verifiedModuleDailyCap?: number;
  onTimeSprint?: number;
  finalAssessment?: number;
  kudos?: number;
  kudosSendLimitPerWeek?: number;
  kudosCooldownDays?: number;
  kudosReceivedCapPerWeek?: number;
  streakMilestone?: number;
  streakMilestoneDays?: number;
  pmReviewMultiplier?: number;
  engagementDropAlertPct?: number;
  sprintCutoff?: string;
}

const MAX_INT = 2 ** 31 - 1;
const MAX_MULTIPLIER = 99.99; // XpRule.pmReviewMultiplier is Decimal(4,2)
const CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Whole-number rules, with their smallest allowed value (the database also checks these). */
const INTEGER_RULES: Record<string, number> = {
  verifiedModule: 0,
  verifiedModuleDailyCap: 0,
  onTimeSprint: 0,
  finalAssessment: 0,
  kudos: 0,
  kudosSendLimitPerWeek: 0,
  kudosCooldownDays: 0,
  kudosReceivedCapPerWeek: 0,
  streakMilestone: 0,
  streakMilestoneDays: 1,
  engagementDropAlertPct: 0,
};

/**
 * Checks a rule edit before it reaches the database: whole numbers of 0 or more (a streak
 * milestone length of 1 or more), a decimal multiplier of 0 or more with at most 2 decimals,
 * and a cutoff written HH:MM. Unknown names are refused. An edit must change something.
 */
export function validateRuleEdit(patch: Record<string, unknown>): XpRuleEdit {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    throw new GrowthError('VALIDATION', 'Nothing to change');
  }
  const edit: Record<string, number | string> = {};
  for (const [name, value] of entries) {
    if (name in INTEGER_RULES) {
      const min = INTEGER_RULES[name] as number;
      if (typeof value !== 'number') {
        throw new GrowthError('VALIDATION', `${name} must be a number`);
      }
      if (!Number.isInteger(value) || value < min || value > MAX_INT) {
        throw new GrowthError('RULE_VALUE', `${name} must be a whole number of ${min} or more`);
      }
      edit[name] = value;
    } else if (name === 'pmReviewMultiplier') {
      if (typeof value !== 'number') {
        throw new GrowthError('VALIDATION', 'pmReviewMultiplier must be a number');
      }
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        value > MAX_MULTIPLIER ||
        Math.abs(value * 100 - Math.round(value * 100)) > 1e-9
      ) {
        throw new GrowthError('RULE_VALUE', 'pmReviewMultiplier must be 0 or more, with at most 2 decimals');
      }
      edit[name] = value;
    } else if (name === 'sprintCutoff') {
      if (typeof value !== 'string') {
        throw new GrowthError('VALIDATION', 'sprintCutoff must be text written HH:MM');
      }
      if (!CUTOFF.test(value)) {
        throw new GrowthError('RULE_VALUE', 'sprintCutoff must be a time written HH:MM');
      }
      edit[name] = value;
    } else {
      throw new GrowthError('VALIDATION', `Unknown XP rule "${name}"`);
    }
  }
  return edit as XpRuleEdit;
}
