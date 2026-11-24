import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type { KudosCategory } from '../../generated/prisma/enums.js';
import { CurrentActor, GamificationHttp, Roles, bodyOf, oneOf, query, str, userIdOf, type Actor } from '../growth-core/index.js';
import { KudosLimitsService } from './kudos/kudos-limits.service.js';
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
    private readonly limitsReader: KudosLimitsService,
  ) {}

  /**
   * The sender only learns that the kudos was sent. Whether the exchange is suspicious, whether the weekly cap
   * cut the XP and the receiver's XP event are not the sender's to know (FR-ENG-09, FR-ENG-13): never in the answer.
   */
  @Post('kudos')
  @Roles('USER')
  async send(@CurrentActor() actor: Actor, @Body() raw: unknown): Promise<{ kudosId: string }> {
    const body = bodyOf(raw);
    const sent = await this.kudos.send({
      workspaceId: actor.workspaceId,
      fromUserId: userIdOf(actor),
      toUserId: str(body, 'toUserId'),
      category: oneOf(str(body, 'category'), CATEGORIES, 'category') as KudosCategory,
      message: str(body, 'message'),
    });
    return { kudosId: sent.kudosId };
  }

  /** How many kudos the user has sent this week, the weekly limit and the cooldown: what the "Send kudos" card shows. */
  @Get('me/kudos-limits')
  @Roles('USER')
  limits(@CurrentActor() actor: Actor) {
    return this.limitsReader.forUser(actor.workspaceId, userIdOf(actor));
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
