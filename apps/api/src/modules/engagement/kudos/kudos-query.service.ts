import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MAX_PAGE, parseCursor, type Db, type KudosPort } from '../../growth-core/index.js';

export interface KudosView {
  id: string;
  fromUserId: string;
  toUserId: string;
  category: string;
  message: string;
  sentOn: string;
  suspicious: boolean;
}

const DEFAULT_LIMIT = 50;
const toView = (k: {
  id: string;
  fromUserId: string;
  toUserId: string;
  category: string;
  message: string;
  sentOn: Date;
  suspicious: boolean;
}): KudosView => ({ ...k, sentOn: k.sentOn.toISOString().slice(0, 10) });

/**
 * Reading kudos. Also IF-04: the only way growth-core learns about kudos, for the badge rule
 * KUDOS_DISTINCT_SENDERS.
 */
@Injectable()
export class KudosQueryService implements KudosPort {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * IF-04: how many DIFFERENT people sent this user a kudos whose XP is AWARDED. Pending, held,
   * rejected and reversed kudos do not count.
   */
  async distinctApprovedSenders(db: Db, userId: string): Promise<number> {
    const senders = await db.kudos.findMany({
      where: { toUserId: userId, xpEvents: { some: { source: 'KUDOS', status: 'AWARDED' } } },
      distinct: ['fromUserId'],
      select: { fromUserId: true },
    });
    return senders.length;
  }

  /**
   * One page of kudos for a viewer: a user sees what they sent or received, a PM sees what
   * involves their own users. Newest first; the cursor is the position of the next row.
   */
  async page(input: {
    workspaceId: string;
    viewer: { role: 'USER'; userId: string } | { role: 'PM'; pmId: string };
    cursor?: string | null;
    limit?: number;
  }): Promise<{ kudos: KudosView[]; nextCursor: string | null }> {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const who =
      input.viewer.role === 'USER'
        ? { OR: [{ fromUserId: input.viewer.userId }, { toUserId: input.viewer.userId }] }
        : { OR: [{ fromUser: { pmId: input.viewer.pmId } }, { toUser: { pmId: input.viewer.pmId } }] };
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId: input.workspaceId, ...who },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    });
    return { kudos: rows.slice(0, take).map(toView), nextCursor: rows.length > take ? String(skip + take) : null };
  }

  /** A user sees the kudos they sent and received, newest first. */
  async listForUser(workspaceId: string, userId: string, limit = DEFAULT_LIMIT): Promise<KudosView[]> {
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId, OR: [{ fromUserId: userId }, { toUserId: userId }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toView);
  }

  /** A PM sees the kudos that involve THEIR OWN users (sent or received), newest first. */
  async listForPm(workspaceId: string, pmId: string, limit = DEFAULT_LIMIT): Promise<KudosView[]> {
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId, OR: [{ fromUser: { pmId } }, { toUser: { pmId } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toView);
  }
}
