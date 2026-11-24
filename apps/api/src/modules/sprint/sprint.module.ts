import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { APPROVAL_MAIL } from './ports/approval-mail.port.js';
import { CALENDAR } from './ports/calendar.port.js';
import { NOTIFICATIONS } from './ports/notification.port.js';
import { XP_LEDGER } from './ports/xp-ledger.port.js';
import { OutboxApprovalMail, OutboxNotification, OutboxXpLedger, PrismaCalendar } from './ports/local-ports.js';
import { SprintActorGuard } from './http/actor.guard.js';
import { PmReportsController } from './pm-reports.controller.js';
import { PmReportsService } from './pm-reports.service.js';
import { PmSheetController } from './pm-sheet.controller.js';
import { PmSheetService } from './pm-sheet.service.js';
import { PmSprintController } from './pm-sprint.controller.js';
import { PmSprintService } from './pm-sprint.service.js';
import { SprintController } from './sprint.controller.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintService } from './sprint.service.js';
import { CLOCK, systemClock } from './time/clock.port.js';

// Owner: E06. Already registered in src/app.module.ts: do not edit app.module.ts.
// Add this module's controllers, providers (services) and exports here.
// Reference shape: src/health/ (docs/architecture.md §3).
@Module({
  // E01's module: the sprint routes run its JwtAuthGuard, which is the thing that sets
  // `req.user`. The sprint guard reads `req.user` and nothing else, so the caller can never
  // be spoofed with a header. IdentityModule is re-exported below.
  imports: [IdentityModule],
  controllers: [SprintController, PmSprintController, PmSheetController, PmReportsController],
  providers: [
    // The guard that turns `req.user` into the caller. E01's JwtAuthGuard runs before it.
    SprintActorGuard,
    // The user-side sprint API (SRS 5.3): the thin controller, the rules, and the queries.
    SprintController,
    SprintService,
    // The PM-side sprint API (SRS 5.4): the owner reply and the no-reply job.
    PmSprintController,
    PmSprintService,
    // The PM's team sheet (SRS 5.4, FR-DS-06): the weeks, the grid, the cell edit and the
    // XLSX export.
    PmSheetController,
    PmSheetService,
    // The PM's sprint report (SRS 5.4, FR-DS-07): the daily, weekly, biweekly and monthly
    // reports, one row per user, every figure labelled with its source.
    PmReportsController,
    PmReportsService,
    SprintRepository,
    // The clock, so the on-time flag and the no-reply job can be tested at a fixed moment.
    { provide: CLOCK, useValue: systemClock },
    // The cross-module channels. Each one writes through the transaction handle it is given,
    // so the change and the row it reports succeed or fail together (DS-02.1).
    // Swap a provider here when the owning module ships its real service; nothing else changes.
    { provide: XP_LEDGER, useClass: OutboxXpLedger },
    { provide: APPROVAL_MAIL, useClass: OutboxApprovalMail },
    { provide: NOTIFICATIONS, useClass: OutboxNotification },
    { provide: CALENDAR, useClass: PrismaCalendar },
  ],
  exports: [CLOCK, XP_LEDGER, APPROVAL_MAIL, NOTIFICATIONS, CALENDAR, IdentityModule],
})
export class SprintModule {}
