import { Injectable } from '@nestjs/common';
import type { ArchivedUserItem, ArchivedUserListResponse } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PmActor } from './directory.actor.js';

/** The Archive page: users whose departure date has come. Moving a user back is done with Edit user. */
@Injectable()
export class ArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every archived user of the PM's workspace (decision: every PM sees every user).
   * Newest archived first, then by User ID so the order never jumps around.
   * Moving a user back is Edit user, which only the managing PM may do: `managedByYou` tells the UI.
   */
  async listArchived(actor: PmActor): Promise<ArchivedUserListResponse> {
    const rows = await this.prisma.user.findMany({
      where: { workspaceId: actor.workspaceId, archivedAt: { not: null } },
      orderBy: [{ archivedAt: 'desc' }, { userId: 'asc' }],
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
        archivedAt: true,
      },
    });

    const items: ArchivedUserItem[] = rows.map((row) => ({
      userId: row.userId,
      name: row.name,
      email: row.email,
      photoPath: row.photoPath,
      position: row.position,
      resource: row.resource,
      onboardDate: toDateOnly(row.onboardDate),
      departureDate: row.departureDate ? toDateOnly(row.departureDate) : null,
      archivedAt: (row.archivedAt as Date).toISOString(), // never null: the query above only returns archived users
      managedByYou: row.pmId === actor.pmId,
    }));
    return { items };
  }
}

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
