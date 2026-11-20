import { Module } from '@nestjs/common';
import { USER_DIRECTORY } from './ports/user-directory.port.js';
import { PrismaUserDirectory } from './xp/prisma-user-directory.js';
import { RewardService } from './xp/reward.service.js';
import { XpLedgerService } from './xp/xp-ledger.service.js';
import { XpRulesService } from './xp/xp-rules.service.js';

// Owner: E09. Already registered in src/app.module.ts: do not edit app.module.ts.
// Add this module's controllers, providers (services) and exports here.
// Reference shape: src/health/ (docs/adr/0002-module-layering.md).
@Module({
  imports: [],
  controllers: [],
  providers: [
    XpLedgerService,
    XpRulesService,
    RewardService,
    { provide: USER_DIRECTORY, useClass: PrismaUserDirectory },
  ],
  // The ledger and reward core are what other modules (engagement, sprint, assessment) call.
  exports: [XpLedgerService, XpRulesService, RewardService],
})
export class GrowthCoreModule {}
