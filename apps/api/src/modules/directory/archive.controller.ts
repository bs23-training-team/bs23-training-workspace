import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ArchivedUserListResponse } from '@bs23/contracts';
import { ArchiveService } from './archive.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in ArchiveService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/archive')
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Get()
  list(@Req() req: RequestWithUser): Promise<ArchivedUserListResponse> {
    return this.archive.listArchived(requirePm(req));
  }
}
