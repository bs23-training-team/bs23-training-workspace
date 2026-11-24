import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { UserExportResponse } from '@bs23/contracts';
import { ExportService } from './export.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in ExportService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('users')
  users(@Req() req: RequestWithUser): Promise<UserExportResponse> {
    return this.exports.exportUsers(requirePm(req));
  }
}
