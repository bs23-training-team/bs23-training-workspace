import { BadRequestException, Body, Controller, Param, Put, Req, UseGuards } from '@nestjs/common';
import {
  ATTENDANCE_MODES,
  POSITIONS,
  USER_RESOURCES,
  type AttendanceMode,
  type Position,
  type UpdateUserRequest,
  type UserProfileResponse,
  type UserResource,
} from '@bs23/contracts';
import { UserEditService } from './user-edit.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { Roles } from '../identity/decorators/access.decorators.js';
import { requirePm, type RequestWithUser } from './directory.actor.js';

/** HTTP only: check the shape of the body, call the service. The rules are in UserEditService. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PM')
@Controller('directory/users')
export class UserEditController {
  constructor(private readonly edit: UserEditService) {}

  @Put(':userId')
  update(
    @Param('userId') userId: string,
    @Req() req: RequestWithUser,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<UserProfileResponse> {
    const b = body ?? {};
    const actor = requirePm(req);

    const request: UpdateUserRequest = {
      name: text(b.name),
      email: text(b.email),
      position: oneOf<Position>(POSITIONS, b.position, 'position'),
      resource: oneOf<UserResource>(USER_RESOURCES, b.resource, 'resource'),
      attendanceMode: oneOf<AttendanceMode>(ATTENDANCE_MODES, b.attendanceMode, 'attendanceMode'),
      onboardDate: text(b.onboardDate),
      departureDate: b.departureDate === null || b.departureDate === undefined ? null : text(b.departureDate),
      teamIds: Array.isArray(b.teamIds) ? b.teamIds.filter((x): x is string => typeof x === 'string') : [],
      ...optionalNumber('skillAssessmentMinutes', b.skillAssessmentMinutes),
      ...optionalNumber('skillAssessmentMarks', b.skillAssessmentMarks),
    };
    return this.edit.updateUser(actor, userId, request);
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, name: string): T {
  const match = allowed.find((a) => a === value);
  if (!match) throw new BadRequestException(`${name} must be one of: ${allowed.join(', ')}.`);
  return match;
}

function optionalNumber<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'number') throw new BadRequestException(`${key} must be a number.`);
  return { [key]: value } as Record<K, number>;
}
