import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthError } from '../errors.js';
import type { Db } from '../ports/db.js';
import { validateRuleEdit } from './xp-rules-input.js';
import type { XpRulesAll, XpRulesReader, XpRuleValues } from './xp-rules.types.js';

/**
 * Reads the one XpRule row of a workspace (IF-03). Editing the rules comes in a later task.
 * Amounts are read when an event is created, so a rule change only affects future events.
 */
@Injectable()
export class XpRulesService implements XpRulesReader {
  constructor(private readonly prisma: PrismaService) {}

  async get(workspaceId: string, db: Db = this.prisma): Promise<XpRuleValues> {
    const rule = await db.xpRule.findUnique({
      where: { workspaceId },
      select: {
        onTimeSprint: true,
        verifiedModule: true,
        finalAssessment: true,
        kudos: true,
        sprintCutoff: true,
      },
    });
    if (!rule) {
      throw new GrowthError('NO_RULE', 'This workspace has no XP rules row');
    }
    return rule;
  }

  /** Every editable rule, for the PM's rules screen. */
  async getAll(workspaceId: string, db: Db = this.prisma): Promise<XpRulesAll> {
    const rule = await db.xpRule.findUnique({ where: { workspaceId } });
    if (!rule) {
      throw new GrowthError('NO_RULE', 'This workspace has no XP rules row');
    }
    return toAll(rule);
  }

  /**
   * A PM edits any subset of the rules; the PM is recorded in updatedById. Only future events
   * use the new amounts (an amount is read when the event is created). The five rules that are
   * stored but not enforced (pmReviewMultiplier, engagementDropAlertPct, verifiedModuleDailyCap,
   * streakMilestone, streakMilestoneDays) are saved like the rest and read by no other code.
   */
  async update(workspaceId: string, pmId: string, patch: Record<string, unknown>): Promise<XpRulesAll> {
    const edit = validateRuleEdit(patch);
    const existing = await this.prisma.xpRule.findUnique({ where: { workspaceId }, select: { id: true } });
    if (!existing) {
      throw new GrowthError('NO_RULE', 'This workspace has no XP rules row');
    }
    const updated = await this.prisma.xpRule.update({
      where: { workspaceId },
      data: { ...edit, updatedById: pmId },
    });
    return toAll(updated);
  }
}

function toAll(rule: {
  verifiedModule: number;
  verifiedModuleDailyCap: number;
  onTimeSprint: number;
  finalAssessment: number;
  kudos: number;
  kudosSendLimitPerWeek: number;
  kudosCooldownDays: number;
  kudosReceivedCapPerWeek: number;
  streakMilestone: number;
  streakMilestoneDays: number;
  pmReviewMultiplier: { toNumber(): number };
  engagementDropAlertPct: number;
  sprintCutoff: string;
  updatedById: string | null;
}): XpRulesAll {
  return {
    verifiedModule: rule.verifiedModule,
    verifiedModuleDailyCap: rule.verifiedModuleDailyCap,
    onTimeSprint: rule.onTimeSprint,
    finalAssessment: rule.finalAssessment,
    kudos: rule.kudos,
    kudosSendLimitPerWeek: rule.kudosSendLimitPerWeek,
    kudosCooldownDays: rule.kudosCooldownDays,
    kudosReceivedCapPerWeek: rule.kudosReceivedCapPerWeek,
    streakMilestone: rule.streakMilestone,
    streakMilestoneDays: rule.streakMilestoneDays,
    pmReviewMultiplier: rule.pmReviewMultiplier.toNumber(),
    engagementDropAlertPct: rule.engagementDropAlertPct,
    sprintCutoff: rule.sprintCutoff,
    updatedById: rule.updatedById,
  };
}
