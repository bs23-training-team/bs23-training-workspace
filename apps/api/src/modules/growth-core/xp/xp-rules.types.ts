import type { Db } from '../ports/db.js';
import type { XpRuleEdit } from './xp-rules-input.js';

/** The XpRule values the reward core needs. The full row has more fields (kudos limits etc.). */
export interface XpRuleValues {
  onTimeSprint: number;
  verifiedModule: number;
  finalAssessment: number;
  kudos: number;
  /** 'HH:MM' org time. A sprint strictly before this is on time. */
  sprintCutoff: string;
}

/** The whole XpRule row as the PM sees and edits it. */
export type XpRulesAll = Required<XpRuleEdit> & { updatedById: string | null };

/** IF-03: read the one XpRule row of a workspace. */
export interface XpRulesReader {
  get(workspaceId: string, db?: Db): Promise<XpRuleValues>;
}
