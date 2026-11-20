import type { Db } from '../ports/db.js';

/** The XpRule values the reward core needs. The full row has more fields (kudos limits etc.). */
export interface XpRuleValues {
  onTimeSprint: number;
  verifiedModule: number;
  finalAssessment: number;
  kudos: number;
  /** 'HH:MM' org time. A sprint strictly before this is on time. */
  sprintCutoff: string;
}

/** IF-03: read the one XpRule row of a workspace. */
export interface XpRulesReader {
  get(workspaceId: string, db?: Db): Promise<XpRuleValues>;
}
