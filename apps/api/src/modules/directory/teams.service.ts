import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { TeamListItem, TeamListResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

export const MAX_TEAM_NAME_LENGTH = 100;

/** Rules of the Teams tab. The controller only handles HTTP. */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every active team of the PM's workspace (decision: every PM sees every team),
   * with its current members. Someone who left the team or an archived user is not listed.
   */
  async listTeams(actor: PmActor): Promise<TeamListResponse> {
    const { workspaceId } = actor;

    const teams = await this.prisma.team.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        pmId: true,
        pm: { select: { name: true } },
        memberships: {
          where: { leftAt: null, user: { archivedAt: null } },
          orderBy: { userId: 'asc' },
          select: { user: { select: { userId: true, name: true, position: true } } },
        },
      },
    });

    const items: TeamListItem[] = teams.map((t) => ({
      id: t.id,
      name: t.name,
      pmId: t.pmId,
      pmName: t.pm.name,
      memberCount: t.memberships.length,
      members: t.memberships.map((m) => m.user),
      managedByYou: t.pmId === actor.pmId,
    }));
    return { items };
  }

  /**
   * Creates a team. The PM who creates it is its PM: pmId always comes from the caller (req.user),
   * never from the request body. Every later write route on a team must check `team.pmId === actor.pmId`
   * and answer FORBIDDEN_SCOPE otherwise (every PM sees every team, only the owner changes it).
   */
  async createTeam(actor: PmActor, rawName: string): Promise<TeamListItem> {
    const { workspaceId } = actor;

    const name = rawName.trim();
    if (!name) throw new BadRequestException('Enter a team name.');
    if (name.length > MAX_TEAM_NAME_LENGTH) {
      throw new BadRequestException(`Team name must be at most ${MAX_TEAM_NAME_LENGTH} characters.`);
    }

    // The database only blocks an exact copy; the rule is "ignoring upper/lower case".
    const existing = await this.prisma.team.findFirst({
      where: { workspaceId, name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A team with this name already exists.');

    const team = await this.prisma.team.create({
      data: { workspaceId, name, pmId: actor.pmId },
      select: { id: true, name: true, pmId: true, pm: { select: { name: true } } },
    });
    return {
      id: team.id,
      name: team.name,
      pmId: team.pmId,
      pmName: team.pm.name,
      memberCount: 0,
      members: [],
      managedByYou: true,
    };
  }
}
