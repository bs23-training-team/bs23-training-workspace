import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { SkillListResponse } from '@bs23/contracts';
import { SkillsService } from './skills.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in SkillsService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@Req() req: RequestWithUser): Promise<SkillListResponse> {
    return this.skills.listSkills(requirePm(req));
  }
}
