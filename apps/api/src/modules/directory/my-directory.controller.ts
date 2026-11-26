import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { MyDirectoryResponse } from '@bs23/contracts';
import { MyDirectoryService } from './my-directory.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requireTrainee, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in MyDirectoryService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('USER')
@Controller('directory/me')
export class MyDirectoryController {
  constructor(private readonly mine: MyDirectoryService) {}

  @Get()
  get(@Req() req: RequestWithUser): Promise<MyDirectoryResponse> {
    return this.mine.getMine(requireTrainee(req).userId);
  }

  @Put()
  update(@Req() req: RequestWithUser, @Body() body: Record<string, unknown> | undefined): Promise<MyDirectoryResponse> {
    return this.mine.updateMine(
      requireTrainee(req).userId,
      typeof body?.name === 'string' ? body.name : '',
      typeof body?.bio === 'string' ? body.bio : '',
    );
  }
}
