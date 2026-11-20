import type { XpRulesReader, XpRuleValues } from '../xp/xp-rules.types.js';

export const DEFAULT_RULES: XpRuleValues = {
  onTimeSprint: 20,
  verifiedModule: 10,
  finalAssessment: 40,
  kudos: 5,
  sprintCutoff: '10:00',
};

/** Returns the rule values you set (defaults match the schema defaults). */
export class FakeXpRules implements XpRulesReader {
  constructor(public values: XpRuleValues = { ...DEFAULT_RULES }) {}

  async get(): Promise<XpRuleValues> {
    return { ...this.values };
  }
}
