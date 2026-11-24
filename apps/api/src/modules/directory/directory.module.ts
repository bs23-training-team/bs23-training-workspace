import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

// Owner: E02. Already registered in src/app.module.ts: do not edit app.module.ts.
// Add this module's controllers, providers (services) and exports here.
// Reference shape: src/health/ (docs/architecture.md §3).
@Module({
  // IdentityModule exports JwtAuthGuard and RolesGuard, which protect every route here.
  imports: [IdentityModule],
  controllers: [
    DirectoryController,
    TeamsController,
  ],
  providers: [
    DirectoryService,
    TeamsService,
  ],
  exports: [
    DirectoryService,
    TeamsService,
  ],
})
export class DirectoryModule {}
