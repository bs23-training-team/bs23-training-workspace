import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentActor, GamificationHttp, Roles, bodyOf, num, pmIdOf, query, str, userIdOf, type Actor } from '../growth-core/index.js';
import { QuestsService } from './quests/quests.service.js';

/** Quest routes. Everyone sees the quests; only a PM creates, records and verifies. */
@Controller()
@GamificationHttp()
export class QuestsController {
  constructor(private readonly quests: QuestsService) {}

  @Post('pm/quests')
  @Roles('PM')
  create(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const body = bodyOf(raw);
    return this.quests.create({
      workspaceId: actor.workspaceId,
      pmId: pmIdOf(actor),
      name: str(body, 'name'),
      description: str(body, 'description'),
      target: num(body, 'target'),
      reward: num(body, 'reward'),
      startDate: str(body, 'startDate'),
      endDate: str(body, 'endDate'),
    });
  }

  /** Records a user's count only. */
  @Post('pm/quests/:id/progress')
  @Roles('PM')
  progress(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() raw: unknown) {
    const body = bodyOf(raw);
    return this.quests.setProgress({
      workspaceId: actor.workspaceId,
      questId: id,
      userId: str(body, 'userId'),
      pmId: pmIdOf(actor),
      count: num(body, 'count'),
    });
  }

  /** Verifies a user's progress and pays once if the target is met. */
  @Post('pm/quests/:id/verify')
  @Roles('PM')
  verify(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() raw: unknown) {
    return this.quests.verify({
      workspaceId: actor.workspaceId,
      questId: id,
      userId: str(bodyOf(raw), 'userId'),
      pmId: pmIdOf(actor),
    });
  }

  @Get('quests')
  list(@CurrentActor() actor: Actor, @Query('cursor') cursor?: unknown) {
    return this.quests.list(actor.workspaceId, { cursor: query(cursor) ?? null });
  }

  /** A user's own progress. */
  @Get('me/quest-progress')
  @Roles('USER')
  ownProgress(@CurrentActor() actor: Actor) {
    return this.quests.progressForUser(actor.workspaceId, userIdOf(actor));
  }

  /** The progress of the PM's own users. */
  @Get('pm/quest-progress')
  @Roles('PM')
  pmProgress(@CurrentActor() actor: Actor, @Query('questId') questId?: unknown) {
    return this.quests.progressForPm(actor.workspaceId, pmIdOf(actor), query(questId));
  }
}
