import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { CurrentActor, GamificationHttp, Roles, bodyOf, bool, oneOf, query, userIdOf, type Actor } from '../growth-core/index.js';
import { LeaderboardPreferenceService } from './leaderboard/leaderboard-preference.service.js';
import type { LeaderboardWindow } from './leaderboard/leaderboard-rank.js';
import { LeaderboardService } from './leaderboard/leaderboard.service.js';

const WINDOWS = ['weekly', 'monthly', 'all'] as const;

/** Leaderboard routes. Filtering, ranking and hiding all happen on the server. */
@Controller()
@GamificationHttp()
export class LeaderboardController {
  constructor(
    private readonly board: LeaderboardService,
    private readonly preferences: LeaderboardPreferenceService,
  ) {}

  @Get('leaderboard')
  get(@CurrentActor() actor: Actor, @Query('window') window?: unknown, @Query('cursor') cursor?: unknown) {
    return this.board.get({
      workspaceId: actor.workspaceId,
      viewer: actor.role === 'PM' ? { role: 'PM', pmId: actor.pmId } : { role: 'USER', userId: actor.userId },
      window: oneOf(query(window) ?? 'all', WINDOWS, 'window') as LeaderboardWindow,
      cursor: query(cursor) ?? null,
    });
  }

  @Get('me/leaderboard-preference')
  @Roles('USER')
  getPreference(@CurrentActor() actor: Actor) {
    return this.preferences.get(actor.workspaceId, userIdOf(actor));
  }

  /** A user hides themself from, or shows themself on, other people's boards. */
  @Put('me/leaderboard-preference')
  @Roles('USER')
  setPreference(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    return this.preferences.set(actor.workspaceId, userIdOf(actor), bool(bodyOf(raw), 'hidden'));
  }
}
