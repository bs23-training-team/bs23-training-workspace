import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  POSITIONS,
  USER_RESOURCES,
  type Position,
  type UserListResponse,
  type UserResource,
} from '@bs23/contracts';
import { DirectoryService } from './directory.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: read the request, call the service. The rules are in DirectoryService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory')
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get('users')
  listUsers(
    @Req() req: RequestWithUser,
    @Query('q') q?: string,
    @Query('position') position?: string,
    @Query('resource') resource?: string,
    @Query('skill') skill?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<UserListResponse> {
    return this.directory.listUsers(requirePm(req), {
      q,
      skill,
      position: oneOf(POSITIONS, position, 'position'),
      resource: oneOf(USER_RESOURCES, resource, 'resource'),
      page: toInt(page, 'page'),
      pageSize: toInt(pageSize, 'pageSize'),
    });
  }
}

function oneOf<T extends Position | UserResource>(
  allowed: readonly T[],
  value: string | undefined,
  name: string,
): T | undefined {
  if (!value) return undefined;
  const match = allowed.find((a) => a === value);
  if (!match) throw new BadRequestException(`${name} must be one of: ${allowed.join(', ')}.`);
  return match;
}

function toInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n)) throw new BadRequestException(`${name} must be a whole number.`);
  return n;
}
