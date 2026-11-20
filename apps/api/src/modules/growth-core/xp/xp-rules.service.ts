import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthError } from '../errors.js';
import type { Db } from '../ports/db.js';
import type { XpRulesReader, XpRuleValues } from './xp-rules.types.js';

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
}
