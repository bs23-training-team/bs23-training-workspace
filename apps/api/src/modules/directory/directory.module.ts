import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { ArchiveController } from './archive.controller.js';
import { ArchiveService } from './archive.service.js';
import { DirectoryController } from './directory.controller.js';
import { DirectoryService } from './directory.service.js';
import { ExportController } from './export.controller.js';
import { ExportService } from './export.service.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';
import { MyDirectoryController } from './my-directory.controller.js';
import { MyDirectoryService } from './my-directory.service.js';
import { PeersController } from './peers.controller.js';
import { PeersService } from './peers.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';
import { UserEditController } from './user-edit.controller.js';
import { UserEditService } from './user-edit.service.js';
import { UserProfileController } from './user-profile.controller.js';
import { UserProfileService } from './user-profile.service.js';

// Owner: E02. Already registered in src/app.module.ts: do not edit app.module.ts.
// Add this module's controllers, providers (services) and exports here.
// Reference shape: src/health/ (docs/architecture.md §3).
@Module({
  // IdentityModule exports JwtAuthGuard and RolesGuard, which protect every route here.
  imports: [IdentityModule],
  controllers: [
    DirectoryController,
    TeamsController,
    UserProfileController,
    FeedbackController,
    UserEditController,
    ArchiveController,
    ExportController,
    MyDirectoryController,
    SearchController,
    SkillsController,
    PeersController,
  ],
  providers: [
    DirectoryService,
    TeamsService,
    UserProfileService,
    FeedbackService,
    UserEditService,
    ArchiveService,
    ExportService,
    MyDirectoryService,
    SearchService,
    SkillsService,
    PeersService,
  ],
  exports: [
    DirectoryService,
    TeamsService,
    UserProfileService,
    FeedbackService,
    UserEditService,
    ArchiveService,
    ExportService,
    MyDirectoryService,
    SearchService,
    SkillsService,
    PeersService,
  ],
})
export class DirectoryModule {}
