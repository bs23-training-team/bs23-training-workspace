import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
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

/**
 * A kudos as a PM sees it: with the suspicious flag, and `managedByYou`: true when this PM manages the sender or
 * the receiver. Every PM reads the kudos of every active user; only the managing PM acts on them.
 */
export interface PmKudosView extends KudosView {
  suspicious: boolean;
  managedByYou: boolean;
}

const DEFAULT_LIMIT = 50;
type KudosRow = {
  id: string;
  fromUserId: string;
  fromUser: { name: string; pmId: string | null };
  toUserId: string;
  toUser: { name: string; pmId: string | null };
  category: KudosCategory;
  message: string;
  sentOn: Date;
  suspicious: boolean;
};
const WITH_NAMES = {
  fromUser: { select: { name: true, pmId: true } },
  toUser: { select: { name: true, pmId: true } },
} as const;
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
const toPmView = (k: KudosRow, pmId: string): PmKudosView => ({
  ...toUserView(k),
  suspicious: k.suspicious,
  managedByYou: k.fromUser.pmId === pmId || k.toUser.pmId === pmId,
});

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
   * involves a user they may read (`readable`, built by the caller: every active user, FR-ENG-53). Newest first; the cursor is the position of the next row. Only a PM's rows
   * carry the suspicious flag.
   */
  async page(input: {
    workspaceId: string;
    viewer: { role: 'USER'; userId: string } | { role: 'PM'; pmId: string; readable: Prisma.UserWhereInput };
    cursor?: string | null;
    limit?: number;
  }): Promise<{ kudos: KudosView[] | PmKudosView[]; nextCursor: string | null }> {
    const skip = parseCursor(input.cursor);
    const take = Math.min(input.limit ?? MAX_PAGE, MAX_PAGE);
    const who =
      input.viewer.role === 'USER'
        ? { OR: [{ fromUserId: input.viewer.userId }, { toUserId: input.viewer.userId }] }
        : { OR: [{ fromUser: input.viewer.readable }, { toUser: input.viewer.readable }] };
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId: input.workspaceId, ...who },
      include: WITH_NAMES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    });
    const shown = rows.slice(0, take);
    const viewer = input.viewer;
    const kudos = viewer.role === 'PM' ? shown.map((k) => toPmView(k, viewer.pmId)) : shown.map(toUserView);
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

  /** A PM sees the kudos that involve a user they may read (`readable`, sent or received), newest first. */
  async listForPm(
    workspaceId: string,
    pmId: string,
    readable: Prisma.UserWhereInput,
    limit = DEFAULT_LIMIT,
  ): Promise<PmKudosView[]> {
    const rows = await this.prisma.kudos.findMany({
      where: { workspaceId, OR: [{ fromUser: readable }, { toUser: readable }] },
      include: WITH_NAMES,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map((k) => toPmView(k, pmId));
  }
}
