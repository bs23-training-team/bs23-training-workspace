import { Module } from '@nestjs/common';
import { NOTIFICATIONS } from './ports/notification.port.js';
import { USER_DIRECTORY } from './ports/user-directory.port.js';
import { CLOCK, systemClock } from './time/clock.port.js';
import { NoopNotificationPort } from './xp/noop-notification-port.js';
import { PrismaUserDirectory } from './xp/prisma-user-directory.js';
import { RewardService } from './xp/reward.service.js';
import { XpAdjustmentService } from './xp/xp-adjustment.service.js';
import { XpLedgerService } from './xp/xp-ledger.service.js';
import { XpReviewService } from './xp/xp-review.service.js';
import { XpRulesService } from './xp/xp-rules.service.js';

// Owner: E09. Already registered in src/app.module.ts: do not edit app.module.ts.
// Add this module's controllers, providers (services) and exports here.
// Reference shape: src/health/ (docs/architecture.md §3).
@Module({
  imports: [],
  controllers: [],
  providers: [
    XpLedgerService,
    XpRulesService,
    RewardService,
    XpReviewService,
    XpAdjustmentService,
    { provide: CLOCK, useValue: systemClock },
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    // Stand-in until E01's notifications service exists: swap this provider, nothing else.
    { provide: NOTIFICATIONS, useClass: NoopNotificationPort },
  ],
  // The ledger and reward core are what other modules (engagement, sprint, assessment) call.
  exports: [XpLedgerService, XpRulesService, RewardService, XpReviewService, XpAdjustmentService],
})
export class GrowthCoreModule {}
