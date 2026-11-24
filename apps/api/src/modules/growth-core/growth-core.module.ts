import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { LevelsService } from './levels/levels.service.js';
import { LEVELS } from './ports/levels.port.js';
import { SettingsController } from './settings.controller.js';
import { StreakBadgesController } from './streak-badges.controller.js';
import { XpController } from './xp.controller.js';
import { XpQueryService } from './xp/xp-query.service.js';
import { BadgesQueryService } from './badges/badges-query.service.js';
import { BadgesService } from './badges/badges.service.js';
import { PmGrowthSummaryService } from './xp/pm-growth-summary.service.js';
import { KudosQueryModule } from '../engagement/kudos/kudos-query.module.js';
import { KudosQueryService } from '../engagement/kudos/kudos-query.service.js';
import { CALENDAR_SOURCE } from './ports/calendar-source.port.js';
import { KUDOS } from './ports/kudos.port.js';
import { NOTIFICATIONS } from './ports/notification.port.js';
import { SPRINT_SOURCE } from './ports/sprint-source.port.js';
import { EmptyCalendarSource, EmptySprintSource } from './streak/empty-sources.js';
import { StreakService } from './streak/streak.service.js';
import { GrowthTriggersService } from './triggers/growth-triggers.service.js';
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
  // E01's module: the routes run its JwtAuthGuard (it sets req.user). It is re-exported below so a module
  // that imports this one (engagement) can use the same guard.
  // KudosQueryModule is engagement's IF-04 reader. It has no dependency on this module, so the
  // two modules do not form a cycle.
  imports: [IdentityModule, KudosQueryModule],
  controllers: [XpController, SettingsController, StreakBadgesController],
  providers: [
    XpLedgerService,
    XpRulesService,
    RewardService,
    XpReviewService,
    XpAdjustmentService,
    XpQueryService,
    LevelsService,
    { provide: LEVELS, useExisting: LevelsService },
    StreakService,
    // Re-checks streaks and automatic badges after sprints, kudos decisions, freezes and nightly.
    GrowthTriggersService,
    // Stand-ins until E06 (sprints) and E07 (attendance) provide the real sources.
    { provide: SPRINT_SOURCE, useClass: EmptySprintSource },
    { provide: CALENDAR_SOURCE, useClass: EmptyCalendarSource },
    BadgesService,
    // Read side for the screens: the badge catalogue with awards and progress, and the PM's per-user summary.
    BadgesQueryService,
    PmGrowthSummaryService,
    // IF-04: the badge rule KUDOS_DISTINCT_SENDERS reads kudos only through engagement's reader.
    { provide: KUDOS, useExisting: KudosQueryService },
    { provide: CLOCK, useValue: systemClock },
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
    // Stand-in until E01's notifications service exists: swap this provider, nothing else.
    { provide: NOTIFICATIONS, useClass: NoopNotificationPort },
  ],
  // The ledger and reward core are what other modules (engagement, sprint, assessment) call.
  exports: [XpLedgerService, XpRulesService, RewardService, XpReviewService, XpAdjustmentService, XpQueryService, LevelsService, LEVELS, StreakService, BadgesService, GrowthTriggersService, IdentityModule],
})
export class GrowthCoreModule {}
