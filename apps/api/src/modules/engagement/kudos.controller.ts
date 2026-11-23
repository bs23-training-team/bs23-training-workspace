import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { KudosCategory } from '../../generated/prisma/enums.js';
import { CurrentActor, GamificationHttp, Roles, bodyOf, oneOf, query, str, userIdOf, type Actor } from '../growth-core/index.js';
import { KudosQueryService } from './kudos/kudos-query.service.js';
import { KudosService } from './kudos/kudos.service.js';

const CATEGORIES = ['HELPFUL', 'GREAT_EXPLANATION', 'TEAMWORK'] as const;

/** Kudos routes. The sender is always the signed-in user; the day is always the server's. */
@Controller()
@GamificationHttp()
export class KudosController {
  constructor(
    private readonly kudos: KudosService,
    private readonly reader: KudosQueryService,
  ) {}

  @Post('kudos')
  @Roles('USER')
  send(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const body = bodyOf(raw);
    return this.kudos.send({
      workspaceId: actor.workspaceId,
      fromUserId: userIdOf(actor),
      toUserId: str(body, 'toUserId'),
      category: oneOf(str(body, 'category'), CATEGORIES, 'category') as KudosCategory,
      message: str(body, 'message'),
    });
  }

  /** A user's own kudos, or a PM's own users' kudos. */
  @Get('kudos')
  list(@CurrentActor() actor: Actor, @Query('cursor') cursor?: unknown) {
    return this.reader.page({
      workspaceId: actor.workspaceId,
      viewer: actor.role === 'PM' ? { role: 'PM', pmId: actor.pmId } : { role: 'USER', userId: actor.userId },
      cursor: query(cursor) ?? null,
    });
  }
}
