import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateUserRequest, UserProfileResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { forbiddenScope, type PmActor } from './directory.actor.js';
import { UserProfileService } from './user-profile.service.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Edit user. Rules (same as the UI):
 *  - the User ID never changes (ADR 0003)
 *  - the departure date must be after the onboarding date, and a changed date must be after today
 *  - an archived user needs a new departure date after today; saving brings them back to All Users
 *  - at least one team; leaving a team keeps the row (`leftAt`), going back clears `leftAt`
 */
@Injectable()
export class UserEditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: UserProfileService,
  ) {}

  async updateUser(actor: PmActor, userId: string, input: UpdateUserRequest): Promise<UserProfileResponse> {
    const workspaceId = actor.workspaceId;

    const current = await this.prisma.user.findFirst({
      where: { userId, workspaceId },
      select: { pmId: true, archivedAt: true, departureDate: true },
    });
    if (!current) throw new NotFoundException('User not found.');
    // Every PM sees every user, but only the managing PM changes one (decision in the PR #31 review).
    if (current.pmId !== actor.pmId) throw forbiddenScope('user');

    const name = input.name.trim();
    const email = input.email.trim();
    if (!name || !email || !input.onboardDate) throw new BadRequestException('Fill in every required field.');
    if (!EMAIL.test(email)) throw new BadRequestException('Enter a valid email address.');

    const teamIds = [...new Set(input.teamIds)];
    if (teamIds.length === 0) throw new BadRequestException('Choose a team.');

    const minutes = input.skillAssessmentMinutes;
    const marks = input.skillAssessmentMarks;
    if (minutes !== undefined && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) {
      throw new BadRequestException('Time allowed must be a whole number from 1 to 180 minutes.');
    }
    if (marks !== undefined && (!Number.isInteger(marks) || marks < 1 || marks > 1000)) {
      throw new BadRequestException('Total marks must be a whole number from 1 to 1000.');
    }

    const onboard = input.onboardDate;
    const departure = input.departureDate || null;
    if (!isDate(onboard) || (departure !== null && !isDate(departure))) {
      throw new BadRequestException('Enter dates as YYYY-MM-DD.');
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentDeparture = current.departureDate ? current.departureDate.toISOString().slice(0, 10) : null;
    if (current.archivedAt && (!departure || departure <= today)) {
      throw new BadRequestException('Set a new departure date after today to move this user back to All Users.');
    }
    if (!departure) {
      if (currentDeparture) throw new BadRequestException('Choose a departure date.');
    } else {
      if (departure <= onboard) throw new BadRequestException('The departure date must be after the onboarding date.');
      if (currentDeparture !== departure && departure <= today) {
        throw new BadRequestException('The departure date has already passed. Choose a date after today.');
      }
    }

    // One email belongs to one account: a user OR a PM (case does not matter).
    // TODO(E01): the Pm lookup below reads E01's table until E01 exports a service for it. Read only.
    const sameEmail = { email: { equals: email, mode: 'insensitive' as const } };
    const [otherUser, otherPm] = await Promise.all([
      this.prisma.user.findFirst({ where: { ...sameEmail, NOT: { userId } }, select: { userId: true } }),
      this.prisma.pm.findFirst({ where: sameEmail, select: { pmId: true } }),
    ]);
    if (otherUser || otherPm) throw new ConflictException('An account with this email already exists.');

    const teams = await this.prisma.team.findMany({
      where: { id: { in: teamIds }, workspaceId, archivedAt: null },
      select: { id: true },
    });
    if (teams.length !== teamIds.length) throw new BadRequestException('Choose a valid team.');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { userId },
        data: {
          name,
          email,
          position: input.position,
          resource: input.resource,
          attendanceMode: input.attendanceMode,
          onboardDate: toDate(onboard),
          departureDate: departure ? toDate(departure) : null,
          ...(minutes !== undefined && { skillAssessmentMinutes: minutes }),
          ...(marks !== undefined && { skillAssessmentMarks: marks }),
          ...(current.archivedAt && { archivedAt: null }), // a new departure date reactivates the user
        },
      });

      const now = await tx.membership.findMany({
        where: { userId, leftAt: null },
        select: { teamId: true },
      });
      const nowIds = now.map((m) => m.teamId);

      const leaving = nowIds.filter((id) => !teamIds.includes(id));
      if (leaving.length) {
        await tx.membership.updateMany({
          where: { userId, teamId: { in: leaving }, leftAt: null },
          data: { leftAt: new Date() },
        });
      }
      for (const teamId of teamIds.filter((id) => !nowIds.includes(id))) {
        await tx.membership.upsert({
          where: { teamId_userId: { teamId, userId } },
          create: { workspaceId, teamId, userId },
          update: { leftAt: null },
        });
      }
    });

    return this.profiles.getProfile(actor, userId);
  }
}

function isDate(value: string): boolean {
  return DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && toDate(value).toISOString().startsWith(value);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
