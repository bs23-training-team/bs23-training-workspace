import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserProfileResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

/** Rules of the user profile page (personal information + RND feedback history). */
@Injectable()
export class UserProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One user of the PM's workspace. An archived user can be opened too
   * (the Archive page uses the same profile). Another workspace's user is "not found".
   * Every PM can open any user, but the feedback history is only for the managing PM: for another
   * PM's user it is never read from the database and `feedback` is empty.
   */
  async getProfile(actor: PmActor, userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findFirst({
      where: { userId, workspaceId: actor.workspaceId },
      select: {
        userId: true,
        pmId: true,
        name: true,
        email: true,
        photoPath: true,
        bio: true,
        position: true,
        resource: true,
        attendanceMode: true,
        onboardDate: true,
        departureDate: true,
        skillAssessmentMinutes: true,
        skillAssessmentMarks: true,
        mustChangePassword: true,
        archivedAt: true,
        userSkills: { select: { skill: { select: { name: true } } } },
        memberships: {
          where: { leftAt: null, team: { archivedAt: null } },
          select: { team: { select: { id: true, name: true } } },
        },
        feedbackVersions: {
          where: { user: { pmId: actor.pmId } },
          orderBy: { version: 'desc' },
          select: {
            version: true,
            text: true,
            authorId: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found.');

    return {
      userId: user.userId,
      name: user.name,
      email: user.email,
      photoPath: user.photoPath,
      bio: user.bio,
      position: user.position,
      resource: user.resource,
      attendanceMode: user.attendanceMode,
      onboardDate: toDateOnly(user.onboardDate),
      departureDate: user.departureDate ? toDateOnly(user.departureDate) : null,
      skillAssessmentMinutes: user.skillAssessmentMinutes,
      skillAssessmentMarks: user.skillAssessmentMarks,
      skills: user.userSkills.map((s) => s.skill.name).sort(),
      teams: user.memberships.map((m) => m.team).sort((a, b) => a.name.localeCompare(b.name)),
      mustChangePassword: user.mustChangePassword,
      archivedAt: user.archivedAt ? user.archivedAt.toISOString() : null,
      managedByYou: user.pmId === actor.pmId,
      feedback: user.feedbackVersions.map((f) => ({
        version: f.version,
        text: f.text,
        authorId: f.authorId,
        authorName: f.author.name,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
