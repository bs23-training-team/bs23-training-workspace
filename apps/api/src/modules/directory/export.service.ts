import { Injectable } from '@nestjs/common';
import type { UserExportResponse, UserExportRow } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

/** "Export all user info": every active user, not affected by any filter of the list. */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportUsers(actor: PmActor): Promise<UserExportResponse> {
    const users = await this.prisma.user.findMany({
      where: { workspaceId: actor.workspaceId, archivedAt: null },
      orderBy: { userId: 'asc' },
      select: {
        userId: true,
        name: true,
        email: true,
        position: true,
        resource: true,
        onboardDate: true,
        departureDate: true,
        userSkills: { select: { skill: { select: { name: true } } } },
        memberships: {
          where: { leftAt: null, team: { archivedAt: null } },
          select: { team: { select: { name: true } } },
        },
      },
    });

    const rows: UserExportRow[] = users.map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      position: u.position,
      resource: u.resource,
      skills: u.userSkills.map((s) => s.skill.name).sort(),
      teams: u.memberships.map((m) => m.team.name).sort(),
      onboardDate: toDateOnly(u.onboardDate),
      departureDate: u.departureDate ? toDateOnly(u.departureDate) : null,
    }));
    return { rows };
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
