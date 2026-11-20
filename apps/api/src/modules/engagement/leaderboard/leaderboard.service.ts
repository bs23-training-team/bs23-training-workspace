import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  CLOCK,
  GrowthError,
  LEVELS,
  XpLedgerService,
  orgToday,
  parseDay,
  type ClockPort,
  type LevelsPort,
  type XpLedger,
} from '../../growth-core/index.js';
import {
  paginate,
  rankCandidates,
  toPeerRows,
  toPmRows,
  windowRange,
  type Candidate,
  type LeaderboardWindow,
  type PeerRow,
  type PmRow,
} from './leaderboard-rank.js';

export type Viewer = { role: 'USER'; userId: string } | { role: 'PM'; pmId: string };

export interface LeaderboardInput {
  workspaceId: string;
  /** From the session. Never a request parameter. */
  viewer: Viewer;
  window: LeaderboardWindow;
  cursor?: string | null;
  /** Page size, at most 100. */
  limit?: number;
}

export type LeaderboardPage =
  | { window: LeaderboardWindow; viewer: 'USER'; rows: PeerRow[]; nextCursor: string | null }
  | { window: LeaderboardWindow; viewer: 'PM'; rows: PmRow[]; nextCursor: string | null };

const WINDOWS: LeaderboardWindow[] = ['weekly', 'monthly', 'all'];

/**
 * The leaderboard: AWARDED XP only, ranked inside the viewer's PM group, with the privacy rules
 * applied on the server. XP comes from growth-core's ledger (IF-01) and levels from IF-02;
 * engagement reads no XP or level table itself.
 */
@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(LEVELS) private readonly levels: LevelsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async get(input: LeaderboardInput): Promise<LeaderboardPage> {
    if (!WINDOWS.includes(input.window)) {
      throw new GrowthError('VALIDATION', 'The window must be weekly, monthly or all');
    }
    const pmId = await this.groupPmId(input.workspaceId, input.viewer);
    const people = await this.prisma.user.findMany({
      where: { workspaceId: input.workspaceId, pmId, archivedAt: null },
      select: { userId: true, name: true, leaderboardPreference: { select: { hidden: true } } },
    });
    const userIds = people.map((p) => p.userId);

    const range = windowRange(input.window, orgToday(this.clock.now()));
    const windowed = await this.ledger.awardedTotals({
      workspaceId: input.workspaceId,
      userIds,
      ...(range.from ? { from: parseDay(range.from) } : {}),
      ...(range.to ? { to: parseDay(range.to) } : {}),
    });
    // The level always comes from ALL-TIME XP, even on the weekly and monthly boards.
    const allTime =
      input.window === 'all' ? windowed : await this.ledger.awardedTotals({ workspaceId: input.workspaceId, userIds });

    const candidates: Candidate[] = [];
    for (const person of people) {
      const level = await this.levels.levelFor(input.workspaceId, allTime.get(person.userId) ?? 0);
      candidates.push({
        userId: person.userId,
        name: person.name,
        xp: windowed.get(person.userId) ?? 0,
        level: level?.name ?? null,
        hidden: person.leaderboardPreference?.hidden ?? false,
      });
    }

    const ranked = rankCandidates(candidates);
    const { rows, nextCursor } = paginate(ranked, input.cursor ?? null, input.limit);
    return input.viewer.role === 'PM'
      ? { window: input.window, viewer: 'PM', rows: toPmRows(rows), nextCursor }
      : { window: input.window, viewer: 'USER', rows: toPeerRows(rows, input.viewer.userId), nextCursor };
  }

  /** A PM sees their own users; a user sees the group of their own PM. */
  private async groupPmId(workspaceId: string, viewer: Viewer): Promise<string> {
    if (viewer.role === 'PM') {
      return viewer.pmId;
    }
    const me = await this.prisma.user.findFirst({
      where: { userId: viewer.userId, workspaceId, archivedAt: null },
      select: { pmId: true },
    });
    if (!me) {
      throw new GrowthError('NOT_FOUND', 'User not found');
    }
    return me.pmId;
  }
}
