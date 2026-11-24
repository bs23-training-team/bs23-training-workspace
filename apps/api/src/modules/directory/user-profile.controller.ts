import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { UserProfileResponse } from '@bs23/contracts';
import { UserProfileService } from './user-profile.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in UserProfileService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/users')
export class UserProfileController {
  constructor(private readonly profiles: UserProfileService) {}

  @Get(':userId')
  get(@Param('userId') userId: string, @Req() req: RequestWithUser): Promise<UserProfileResponse> {
    return this.profiles.getProfile(requirePm(req), userId);
  }
}
