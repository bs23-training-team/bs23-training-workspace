import { Module } from '@nestjs/common';
import { CLOCK, GrowthCoreModule, systemClock } from '../growth-core/index.js';
import { KudosQueryModule } from './kudos/kudos-query.module.js';
import { KudosService } from './kudos/kudos.service.js';
import { ENGAGEMENT_NOTIFICATIONS, NoopEngagementNotifications } from './ports/engagement-notification.port.js';

// Owner: E10. Already registered in src/app.module.ts: do not edit app.module.ts.
// Engagement talks to growth-core only through its exported services (IF-01 ledger, IF-03 rules).
@Module({
  imports: [GrowthCoreModule, KudosQueryModule],
  controllers: [],
  providers: [
    KudosService,
    { provide: CLOCK, useValue: systemClock },
    // Stand-in until E01's notifications service exists: swap this provider, nothing else.
    { provide: ENGAGEMENT_NOTIFICATIONS, useClass: NoopEngagementNotifications },
  ],
  // KudosQueryModule exports KudosQueryService: IF-04, also used by growth-core's badge rule.
  exports: [KudosService, KudosQueryModule],
})
export class EngagementModule {}
