import { Module } from '@nestjs/common';
import { ACTOR_RESOLVER, CLOCK, DenyAllActorResolver, GrowthCoreModule, systemClock } from '../growth-core/index.js';
import { KudosController } from './kudos.controller.js';
import { LeaderboardController } from './leaderboard.controller.js';
import { QuestsController } from './quests.controller.js';
import { LeaderboardPreferenceService } from './leaderboard/leaderboard-preference.service.js';
import { LeaderboardService } from './leaderboard/leaderboard.service.js';
import { QuestsService } from './quests/quests.service.js';
import { KudosQueryModule } from './kudos/kudos-query.module.js';
import { KudosService } from './kudos/kudos.service.js';
import { ENGAGEMENT_NOTIFICATIONS, NoopEngagementNotifications } from './ports/engagement-notification.port.js';

// Owner: E10. Already registered in src/app.module.ts: do not edit app.module.ts.
// Engagement talks to growth-core only through its exported services (IF-01 ledger, IF-03 rules).
@Module({
  imports: [GrowthCoreModule, KudosQueryModule],
  controllers: [KudosController, QuestsController, LeaderboardController],
  providers: [
    KudosService,
    LeaderboardService,
    LeaderboardPreferenceService,
    QuestsService,
    { provide: CLOCK, useValue: systemClock },
    // Nobody is signed in until real auth (E01) provides a resolver under this token: routes answer 401.
    { provide: ACTOR_RESOLVER, useClass: DenyAllActorResolver },
    // Stand-in until E01's notifications service exists: swap this provider, nothing else.
    { provide: ENGAGEMENT_NOTIFICATIONS, useClass: NoopEngagementNotifications },
  ],
  // KudosQueryModule exports KudosQueryService: IF-04, also used by growth-core's badge rule.
  exports: [KudosService, LeaderboardService, LeaderboardPreferenceService, QuestsService, KudosQueryModule],
})
export class EngagementModule {}
