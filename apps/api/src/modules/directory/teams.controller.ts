import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { TeamListItem, TeamListResponse } from '@bs23/contracts';
import { TeamsService } from './teams.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in TeamsService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  list(@Req() req: RequestWithUser): Promise<TeamListResponse> {
    return this.teams.listTeams(requirePm(req));
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() body: { name?: unknown } | undefined): Promise<TeamListItem> {
    const name = typeof body?.name === 'string' ? body.name : '';
    return this.teams.createTeam(requirePm(req), name);
  }
}
