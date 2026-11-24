import { Injectable } from '@nestjs/common';
import type { UserListItem, UserListQuery, UserListResponse } from '@bs23/contracts';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

export const DEFAULT_PAGE_SIZE = 5;
export const MAX_PAGE_SIZE = 50;

/** All the rules of the directory module live here (the controller only handles HTTP). */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The All Users list: every active (not archived) user of the PM's workspace.
   * Decision (architecture owner, relayed by E11 in the PR #31 review): every PM sees every active
   * user of the workspace in this list. This deviates from PRD FR-ROLE-02 and FR-DIR-01; the PRD
   * update is with the team lead. Writes and `latestFeedback` stay scoped to the PM's own users
   * (pmId): feedback is written by the managing PM, so for another PM's user it is null.
   */
  async listUsers(actor: PmActor, query: UserListQuery): Promise<UserListResponse> {
    const q = query.q?.trim();
    const where: Prisma.UserWhereInput = {
      workspaceId: actor.workspaceId,
      archivedAt: null,
      ...(query.position && { position: query.position }),
      ...(query.resource && { resource: query.resource }),
      // TODO(E03): reads E03's Skill table through the UserSkill relation; move to an E03 service when it exports one.
      ...(query.skill && { userSkills: { some: { skill: { name: query.skill } } } }),
      // PRD FR-DIR-02: search by name or User ID only. Not by email: every PM sees every user, so
      // an email search would let a PM look up another PM's users by address.
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { userId: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const total = await this.prisma.user.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    // Like the UI: a page number past the end shows the last page.
    const page = Math.min(Math.max(query.page ?? 1, 1), totalPages);

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { userId: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        userId: true,
        pmId: true,
        name: true,
        email: true,
        photoPath: true,
        position: true,
        resource: true,
        onboardDate: true,
        departureDate: true,
        userSkills: { select: { skill: { select: { name: true } } } },
        // Only the PM's own users: another PM's feedback text is never read from the database.
        feedbackVersions: {
          where: { user: { pmId: actor.pmId } },
          orderBy: { version: 'desc' },
          take: 1,
          select: { text: true },
        },
      },
    });

    const items: UserListItem[] = rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      photoPath: row.photoPath,
      position: row.position,
      resource: row.resource,
      skills: row.userSkills.map((s) => s.skill.name).sort(),
      onboardDate: toDateOnly(row.onboardDate),
      departureDate: row.departureDate ? toDateOnly(row.departureDate) : null,
      latestFeedback: row.pmId === actor.pmId ? (row.feedbackVersions[0]?.text ?? null) : null,
      managedByYou: row.pmId === actor.pmId,
    }));

    return { items, total, page, pageSize, totalPages };
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
