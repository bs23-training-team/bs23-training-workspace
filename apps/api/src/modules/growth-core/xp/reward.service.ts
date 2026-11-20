import { Inject, Injectable } from '@nestjs/common';
import type { Db } from '../ports/db.js';
import { USER_DIRECTORY, type UserDirectoryPort } from '../ports/user-directory.port.js';
import { isBeforeCutoff, orgToday, parseDay } from '../time/org-time.js';
import { finalAssessmentKey, moduleKey, sprintKey } from './xp-keys.js';
import { XpLedgerService } from './xp-ledger.service.js';
import type { XpLedger } from './xp-ledger.types.js';
import { XpRulesService } from './xp-rules.service.js';
import type { XpRulesReader } from './xp-rules.types.js';

export type RewardSkipReason = 'LATE' | 'NOT_MASTERED' | 'UNKNOWN_USER';

export interface RewardOutcome {
  /** true only when this call created a new event. */
  created: boolean;
  /** The event id when one exists (new or earlier); null when nothing was awarded. */
  eventId: string | null;
  /** Why no event was created, when that is not simply "it already existed". */
  skipped?: RewardSkipReason;
}

/**
 * The reward core: other modules report a FACT (a sprint, a mastered topic, a passed final
 * assessment) and this service decides the day, the amount and the key. The caller never
 * sends an amount, a day or an "on time" flag. The result is always a PENDING event that a
 * PM reviews later.
 *
 * It does not write sprint data: the sprint module (E06) records the submission itself and
 * only tells us when it happened.
 */
@Injectable()
export class RewardService {
  constructor(
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(XpRulesService) private readonly rules: XpRulesReader,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectoryPort,
  ) {}

  /** A sprint was submitted. Creates XP only if it was strictly before the cutoff. */
  async recordSprint(
    input: { workspaceId: string; userId: string; submittedAt: Date },
    db?: Db,
  ): Promise<RewardOutcome> {
    if (!(await this.users.isActiveUser(input.workspaceId, input.userId, db))) {
      return { created: false, eventId: null, skipped: 'UNKNOWN_USER' };
    }
    const rule = await this.rules.get(input.workspaceId, db);
    if (!isBeforeCutoff(input.submittedAt, rule.sprintCutoff)) {
      return { created: false, eventId: null, skipped: 'LATE' };
    }
    const day = orgToday(input.submittedAt);
    return this.award(
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        source: 'ON_TIME_SPRINT',
        amount: rule.onTimeSprint,
        key: sprintKey(input.userId, day),
        evidence: `On-time sprint on ${day}`,
        occurredOn: parseDay(day),
      },
      db,
    );
  }

  /** A topic was finalised. Creates XP only when the PM ticked "mastered". */
  async recordVerifiedModule(
    input: {
      workspaceId: string;
      userId: string;
      topicId: string;
      topicTitle?: string;
      mastered: boolean;
      occurredAt: Date;
    },
    db?: Db,
  ): Promise<RewardOutcome> {
    if (!input.mastered) {
      return { created: false, eventId: null, skipped: 'NOT_MASTERED' };
    }
    if (!(await this.users.isActiveUser(input.workspaceId, input.userId, db))) {
      return { created: false, eventId: null, skipped: 'UNKNOWN_USER' };
    }
    const rule = await this.rules.get(input.workspaceId, db);
    return this.award(
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        source: 'VERIFIED_MODULE',
        amount: rule.verifiedModule, // always the full amount: the daily cap is not enforced in v1
        key: moduleKey(input.userId, input.topicId),
        evidence: `Verified module: ${input.topicTitle?.trim() || input.topicId}`,
        occurredOn: parseDay(orgToday(input.occurredAt)),
      },
      db,
    );
  }

  /** A final assessment was finalised. Creates XP only when the PM ticked "mastered". */
  async recordFinalAssessment(
    input: {
      workspaceId: string;
      userId: string;
      questionSetId: string;
      attemptId?: string;
      mastered: boolean;
      occurredAt: Date;
    },
    db?: Db,
  ): Promise<RewardOutcome> {
    if (!input.mastered) {
      return { created: false, eventId: null, skipped: 'NOT_MASTERED' };
    }
    if (!(await this.users.isActiveUser(input.workspaceId, input.userId, db))) {
      return { created: false, eventId: null, skipped: 'UNKNOWN_USER' };
    }
    const rule = await this.rules.get(input.workspaceId, db);
    return this.award(
      {
        workspaceId: input.workspaceId,
        userId: input.userId,
        source: 'FINAL_ASSESSMENT',
        amount: rule.finalAssessment,
        key: finalAssessmentKey(input.userId, input.questionSetId),
        evidence: `Final assessment passed (set ${input.questionSetId})`,
        occurredOn: parseDay(orgToday(input.occurredAt)),
        attemptId: input.attemptId ?? null,
      },
      db,
    );
  }

  private async award(
    event: Parameters<XpLedger['createEvent']>[0],
    db?: Db,
  ): Promise<RewardOutcome> {
    const { event: row, created } = await this.ledger.createEvent(event, db);
    return { created, eventId: row.id };
  }
}
