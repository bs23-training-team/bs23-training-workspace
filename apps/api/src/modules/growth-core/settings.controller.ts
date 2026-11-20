import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentActor, GamificationHttp, Roles } from './http/actor.guard.js';
import { pmIdOf, type Actor } from './http/actor.js';
import { bodyOf, list, num, str } from './http/parse.js';
import { LevelsService } from './levels/levels.service.js';
import { XpRulesService } from './xp/xp-rules.service.js';

/** Level and XP-rule routes: anyone signed in may read the levels; only a PM changes anything. */
@Controller()
@GamificationHttp()
export class SettingsController {
  constructor(
    private readonly rules: XpRulesService,
    private readonly levels: LevelsService,
  ) {}

  @Get('pm/xp-rules')
  @Roles('PM')
  getRules(@CurrentActor() actor: Actor) {
    return this.rules.getAll(actor.workspaceId);
  }

  /** Any subset of the rules. Unknown names and bad values are refused by the service. */
  @Put('pm/xp-rules')
  @Roles('PM')
  updateRules(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    return this.rules.update(actor.workspaceId, pmIdOf(actor), bodyOf(raw));
  }

  /** The active levels, lowest first. Everyone sees the same levels. */
  @Get('levels')
  getLevels(@CurrentActor() actor: Actor) {
    return this.levels.active(actor.workspaceId);
  }

  /** The whole level set, saved as one set. */
  @Put('pm/levels')
  @Roles('PM')
  saveLevels(@CurrentActor() actor: Actor, @Body() raw: unknown) {
    const items = list(bodyOf(raw), 'levels').map((item) => {
      const level = bodyOf(item);
      return { name: str(level, 'name'), minXp: num(level, 'minXp') };
    });
    return this.levels.save(actor.workspaceId, items);
  }
}
