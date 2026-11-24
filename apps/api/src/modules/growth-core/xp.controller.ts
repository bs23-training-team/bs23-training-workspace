import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { XpStatus } from '../../generated/prisma/enums.js';
import { CurrentActor, GamificationHttp, Roles } from './http/actor.guard.js';
import { pmIdOf, userIdOf, type Actor } from './http/actor.js';
import { bodyOf, num, oneOf, query, str } from './http/parse.js';
import { GrowthTriggersService } from './triggers/growth-triggers.service.js';
import { PmGrowthSummaryService } from './xp/pm-growth-summary.service.js';
import { XpAdjustmentService } from './xp/xp-adjustment.service.js';
import { XpQueryService } from './xp/xp-query.service.js';
import { XpReviewService } from './xp/xp-review.service.js';

const STATUSES = ['PENDING', 'AWARDED', 'HELD', 'REJECTED', 'REVERSED'] as const;
const DECISIONS = ['AWARDED', 'HELD', 'REJECTED', 'REVERSED'] as const;

/** XP routes. Thin: read the request, call the service. The caller is always the signed-in person. */
@Controller()
@GamificationHttp()
export class XpController {
  constructor(
    private readonly review: XpReviewService,
    private readonly adjustments: XpAdjustmentService,
    private readonly xp: XpQueryService,
    private readonly summaries: PmGrowthSummaryService,
    private readonly triggers: GrowthTriggersService,
  ) {}

  /**
   * A PM awards, holds, rejects or reverses an XP event, with a reason. After the decision is saved,
   * a kudos event re-checks the receiver's automatic badges (approved senders changed).
   */
  @Post('pm/xp-events/:id/decision')
  @Roles('PM')
  async decide(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() raw: unknown) {
    const body = bodyOf(raw);
    const result = await this.review.decide({
      workspaceId: actor.workspaceId,
      eventId: id,
      pmId: pmIdOf(actor),
      toStatus: oneOf(str(body, 'status'), DECISIONS, 'status') as XpStatus,
      reason: str(body, 'reason'),
    });
    await this.triggers.afterXpDecision(actor.workspaceId, result.eventId);
    return result;
  }

  /** A PM adds or removes XP by hand for one of their users. */
  @Post('pm/xp-adjustments')
  @Roles('PM')
  adjust(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const body = bodyOf(raw);
    return this.adjustments.adjust({
      workspaceId: actor.workspaceId,
      pmId: pmIdOf(actor),
      userId: str(body, 'userId'),
      amount: num(body, 'amount'),
      reason: str(body, 'reason'),
    });
  }

  /** The PM's review queue and history for their own users. */
  @Get('pm/xp-events')
  @Roles('PM')
  queue(
    @CurrentActor() actor: Actor,
    @Query('status') status?: unknown,
    @Query('userId') userId?: unknown,
    @Query('cursor') cursor?: unknown,
  ) {
    const rawStatus = query(status);
    return this.xp.queue({
      workspaceId: actor.workspaceId,
      pmId: pmIdOf(actor),
      ...(rawStatus ? { status: oneOf(rawStatus, STATUSES, 'status') as XpStatus } : {}),
      ...(query(userId) ? { userId: query(userId) as string } : {}),
      cursor: query(cursor) ?? null,
    });
  }

  /**
   * One line per user (XP, level, streak) for the PM's Trainees tab. The users come from the directory's rule
   * (pmVisibleUsers), not from the PM's own team.
   */
  @Get('pm/growth-summary')
  @Roles('PM')
  summary(@CurrentActor() actor: Actor, @Query('cursor') cursor?: unknown) {
    return this.summaries.page(actor.workspaceId, { cursor: query(cursor) ?? null });
  }

  /** A user's own level, XP, streak and badges. */
  @Get('me/growth')
  @Roles('USER')
  growth(@CurrentActor() actor: Actor) {
    return this.xp.myGrowth(actor.workspaceId, userIdOf(actor));
  }

  /** A user's own XP events. */
  @Get('me/xp-events')
  @Roles('USER')
  ownEvents(@CurrentActor() actor: Actor, @Query('cursor') cursor?: unknown) {
    return this.xp.ownEvents(actor.workspaceId, userIdOf(actor), { cursor: query(cursor) ?? null });
  }
}

