import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { BadgeKind, BadgeRuleType, FreezeSource } from '../../generated/prisma/enums.js';
import { BadgesService } from './badges/badges.service.js';
import { GrowthError } from './errors.js';
import { CurrentActor, GamificationHttp, Roles } from './http/actor.guard.js';
import { pmIdOf, userIdOf, type Actor } from './http/actor.js';
import { bodyOf, oneOf, optNum, optStr, query, str } from './http/parse.js';
import { StreakService } from './streak/streak.service.js';
import { GrowthTriggersService } from './triggers/growth-triggers.service.js';

const KINDS = ['BEHAVIORAL', 'SPECIAL'] as const;
const RULES = ['ON_TIME_SPRINT_STREAK', 'SPRINT_STREAK', 'KUDOS_DISTINCT_SENDERS', 'MANUAL'] as const;
const SOURCES = ['LEAVE', 'HOLIDAY'] as const;

/** Streak freezes and badges. Every action is a PM's, for users in their own scope. */
@Controller()
@GamificationHttp()
export class StreakBadgesController {
  constructor(
    private readonly streaks: StreakService,
    private readonly badges: BadgesService,
    private readonly triggers: GrowthTriggersService,
  ) {}

  /**
   * A PM freezes one day for a user (leave or a holiday). The reason stays private to PMs. A freeze
   * can extend a streak, so the user's automatic badges are re-checked once it is saved.
   */
  @Post('pm/streak-freezes')
  @Roles('PM')
  async freeze(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const body = bodyOf(raw);
    const userId = str(body, 'userId');
    const result = await this.streaks.grantFreeze({
      workspaceId: actor.workspaceId,
      pmId: pmIdOf(actor),
      userId,
      date: str(body, 'date'),
      source: oneOf(str(body, 'source'), SOURCES, 'source') as FreezeSource,
      reason: str(body, 'reason'),
    });
    await this.triggers.afterStreakChange(actor.workspaceId, userId);
    return result;
  }

  /** The freezes of one of the PM's users, with their private reasons. */
  @Get('pm/streak-freezes')
  @Roles('PM')
  freezesForPm(@CurrentActor() actor: Actor, @Query('userId') userId?: unknown) {
    const id = query(userId);
    if (!id) {
      throw new GrowthError('VALIDATION', 'userId is required');
    }
    return this.streaks.listFreezesForPm(actor.workspaceId, pmIdOf(actor), id);
  }

  /** A user's own freezes: the date and source only, never the reason. */
  @Get('me/streak-freezes')
  @Roles('USER')
  ownFreezes(@CurrentActor() actor: Actor) {
    return this.streaks.listOwnFreezes(userIdOf(actor));
  }

  @Post('pm/badges')
  @Roles('PM')
  createBadge(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const body = bodyOf(raw);
    const ruleType = optStr(body, 'ruleType');
    const threshold = optNum(body, 'threshold');
    return this.badges.create({
      workspaceId: actor.workspaceId,
      pmId: pmIdOf(actor),
      name: str(body, 'name'),
      icon: str(body, 'icon'),
      kind: oneOf(str(body, 'kind'), KINDS, 'kind') as BadgeKind,
      criteria: str(body, 'criteria'),
      ...(ruleType ? { ruleType: oneOf(ruleType, RULES, 'ruleType') as BadgeRuleType } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
    });
  }

  @Post('pm/badges/:id/retire')
  @Roles('PM')
  async retireBadge(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.badges.retire({ workspaceId: actor.workspaceId, badgeId: id, pmId: pmIdOf(actor) });
    return { retired: true };
  }

  /** A PM awards a Special badge to one of their users, with evidence. */
  @Post('pm/badges/:id/awards')
  @Roles('PM')
  awardBadge(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() raw: unknown) {
    const body = bodyOf(raw);
    return this.badges.awardSpecial({
      workspaceId: actor.workspaceId,
      badgeId: id,
      userId: str(body, 'userId'),
      pmId: pmIdOf(actor),
      evidence: str(body, 'evidence'),
    });
  }

  @Post('pm/badge-awards/:id/revoke')
  @Roles('PM')
  async revokeBadge(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() raw: unknown) {
    await this.badges.revoke({
      workspaceId: actor.workspaceId,
      awardId: id,
      pmId: pmIdOf(actor),
      reason: str(bodyOf(raw), 'reason'),
    });
    return { revoked: true };
  }
}

