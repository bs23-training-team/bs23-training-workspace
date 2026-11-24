import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { KudosCategory } from '../../../generated/prisma/enums.js';
// growth-core imports this file (IF-04), so these come from growth-core's leaf files and NOT from its index.
// Importing the index would make a file cycle: growth-core/index -> growth-core.module -> kudos-query.module
// -> kudos-query.service -> growth-core/index. The types are `import type`, erased at build time.
import { MAX_PAGE, parseCursor } from '../../growth-core/paging.js';
import type { Db } from '../../growth-core/ports/db.js';
import type { KudosPort } from '../../growth-core/ports/kudos.port.js';

/** A kudos as a USER sees it. Whether it is part of a suspicious exchange is a PM's information: never here. */
export interface KudosView {
  id: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  category: KudosCategory;
  message: string;
  sentOn: string;
}

/** A kudos as a PM sees it: with the suspicious flag. */
export interface PmKudosView extends KudosView {
  suspicious: boolean;
}

const DEFAULT_LIMIT = 50;
type KudosRow = {
  id: string;
  fromUserId: string;
  fromUser: { name: string };
  toUserId: string;
  toUser: { name: string };
  category: KudosCategory;
  message: string;
  sentOn: Date;
  suspicious: boolean;
};
const WITH_NAMES = { fromUser: { select: { name: true } }, toUser: { select: { name: true } } } as const;
// Built field by field (no spread of the row), so a new column can never reach a user by accident.
const toUserView = (k: KudosRow): KudosView => ({
  id: k.id,
  fromUserId: k.fromUserId,
  fromName: k.fromUser.name,
  toUserId: k.toUserId,
  toName: k.toUser.name,
  category: k.category,
  message: k.message,
  sentOn: k.sentOn.toISOString().slice(0, 10),
});
const toPmView = (k: KudosRow): PmKudosView => ({ ...toUserView(k), suspicious: k.suspicious });

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
   * involves their own users. Newest first; the cursor is the position of the next row. Only a PM's rows
   * carry the suspicious flag.
   */
  async page(input: {
    workspaceId: string;
    viewer: { role: 'USER'; userId: string } | { role: 'PM'; pmId: string };
    cursor?: string | null;
    limit?: number;
  }): Promise<{ kudos: KudosView[] | PmKudosView[]; nextCursor: string | null }> {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const who =
      input.viewer.role === 'USER'
        ? { OR: [{ fromUserId: input.viewer.userId }, { toUserId: input.viewer.userId }] }
        : { OR: [{ fromUser: { pmId: input.viewer.pmId } }, { toUser: { pmId: input.viewer.pmId } }] };
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId: input.workspaceId, ...who },
      include: WITH_NAMES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    });
    const shown = rows.slice(0, take);
    const kudos = input.viewer.role === 'PM' ? shown.map(toPmView) : shown.map(toUserView);
    return { kudos, nextCursor: rows.length > take ? String(skip + take) : null };
  }

  /** A user sees the kudos they sent and received, newest first. */
  async listForUser(workspaceId: string, userId: string, limit = DEFAULT_LIMIT): Promise<KudosView[]> {
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId, OR: [{ fromUserId: userId }, { toUserId: userId }] },
      include: WITH_NAMES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toUserView);
  }

  /** A PM sees the kudos that involve THEIR OWN users (sent or received), newest first. */
  async listForPm(workspaceId: string, pmId: string, limit = DEFAULT_LIMIT): Promise<PmKudosView[]> {
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId, OR: [{ fromUser: { pmId } }, { toUser: { pmId } }] },
      include: WITH_NAMES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toPmView);
  }
}
