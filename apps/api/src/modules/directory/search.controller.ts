import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { UserSearchResponse } from '@bs23/contracts';
import { SearchService } from './search.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in SearchService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  find(@Req() req: RequestWithUser, @Query('q') q?: string): Promise<UserSearchResponse> {
    return this.search.searchUsers(requirePm(req), q ?? '');
  }
}
