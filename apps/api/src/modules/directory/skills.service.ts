import { Injectable } from '@nestjs/common';
import type { SkillListResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

/** The skills a PM can filter the All Users list by. The skills themselves belong to E03 (read only here). */
@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO(E03): reads the Skill table directly until E03 exports a service for it. Read only, never write.
  async listSkills(actor: PmActor): Promise<SkillListResponse> {
    const rows = await this.prisma.skill.findMany({
      where: { workspaceId: actor.workspaceId, isActive: true },
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    return { items: rows.map((r) => r.name) };
  }
}
