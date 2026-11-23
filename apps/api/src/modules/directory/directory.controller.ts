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
    @Query('q') q?: unknown,
    @Query('position') position?: unknown,
    @Query('resource') resource?: unknown,
    @Query('skill') skill?: unknown,
    @Query('page') page?: unknown,
    @Query('pageSize') pageSize?: unknown,
  ): Promise<UserListResponse> {
    const actor = requirePm(req);
    return this.directory.listUsers(actor, {
      q: text(q, 'q'),
      skill: text(skill, 'skill'),
      position: oneOf(POSITIONS, text(position, 'position'), 'position'),
      resource: oneOf(USER_RESOURCES, text(resource, 'resource'), 'resource'),
      page: toInt(text(page, 'page'), 'page'),
      pageSize: toInt(text(pageSize, 'pageSize'), 'pageSize'),
    });
  }
}

/** A query value must be one plain string. `?q=a&q=b` arrives as an array: answer 400, never a 500. */
function text(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new BadRequestException(`${name} must be given once, as text.`);
  return value;
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
