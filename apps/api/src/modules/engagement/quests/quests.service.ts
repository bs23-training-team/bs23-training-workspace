import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  CLOCK,
  GrowthError,
  LEVELS,
  XpLedgerService,
  lockUser,
  orgToday,
  parseDay,
  questKey,
  type ClockPort,
  type DayString,
  type LevelsPort,
  type Tx,
  type XpLedger,
} from '../../growth-core/index.js';
import { MAX_PAGE, parseCursor } from '../paging.js';
import { pmReadableUsers } from '../visibility/pm-readable-users.js';
import { validateCount, validateNewQuest, type NewQuestInput } from './quest-input.js';

export interface CreateQuestInput extends NewQuestInput {
  workspaceId: string;
  /** The creating PM, from the session. */
  pmId: string;
}

export interface QuestRef {
  workspaceId: string;
  questId: string;
  userId: string;
  /** The acting PM, from the session. Never trusted from a request body. */
  pmId: string;
}

export type VerifyResult =
  | { paid: true; amount: number; eventId: string }
  | { paid: false; reason: 'BELOW_TARGET'; count: number; target: number }
  | { paid: false; reason: 'ALREADY_PAID' };

export interface QuestView {
  id: string;
  name: string;
  description: string;
  target: number;
  reward: number;
  startDate: DayString;
  endDate: DayString;
}

export interface ProgressView {
  questId: string;
  userId: string;
  count: number;
  verifiedAt: string | null;
}

/** Progress as a PM sees it: `managedByYou` is true when this PM manages the user, the only PM who may verify. */
export interface PmProgressView extends ProgressView {
  managedByYou: boolean;
}

const day = (date: Date): DayString => date.toISOString().slice(0, 10);

/**
 * Quests: a PM creates a goal, records a user's progress and verifies it. A verified quest at or
 * above its target pays ONCE, straight to AWARDED (no review), through growth-core's ledger
 * (IF-01), and a level-up notice goes through IF-02 in the same transaction. The unique key
 * `quest:<questId>:<userId>` plus the per-user lock make a second, concurrent or later-edited
 * verify pay nothing more.
 */
@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(XpLedgerService) private readonly ledger: XpLedger,
    @Inject(LEVELS) private readonly levels: LevelsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async create(input: CreateQuestInput): Promise<{ questId: string }> {
    const quest = validateNewQuest(input);
    const created = await this.prisma.quest.create({
      data: {
        workspaceId: input.workspaceId,
        createdById: input.pmId,
        name: quest.name,
        description: quest.description,
        target: quest.target,
        reward: quest.reward,
        startDate: parseDay(quest.startDate),
        endDate: parseDay(quest.endDate),
      },
      select: { id: true },
    });
    return { questId: created.id };
  }

  /** The PM records how far a user has got. Replaces the count; one row per quest and user. */
  async setProgress(input: QuestRef & { count: number }): Promise<{ count: number }> {
    const count = validateCount(input.count);
    return this.prisma.$transaction(async (tx) => {
      await this.requireQuestAndUser(tx, input);
      await lockUser(tx, input.userId);
      const saved = await tx.questProgress.upsert({
        where: { questId_userId: { questId: input.questId, userId: input.userId } },
        create: { workspaceId: input.workspaceId, questId: input.questId, userId: input.userId, count },
        update: { count },
        select: { count: true },
      });
      return saved;
    });
  }

  /**
   * The PM verifies a user's progress. Below the target: nothing is paid and nothing is marked.
   * At or above it: one QUEST event with the reward AS IT IS NOW, already AWARDED, and the
   * verification is recorded. A repeat pays nothing.
   */
  async verify(input: QuestRef): Promise<VerifyResult> {
    return this.prisma.$transaction(async (tx) => {
      const { quest } = await this.requireQuestAndUser(tx, input);
      await lockUser(tx, input.userId);

      const progress = await tx.questProgress.findUnique({
        where: { questId_userId: { questId: input.questId, userId: input.userId } },
        select: { id: true, count: true },
      });
      if (!progress) {
        throw new GrowthError('NO_PROGRESS', 'No progress has been recorded for this user');
      }
      if (progress.count < quest.target) {
        return { paid: false, reason: 'BELOW_TARGET', count: progress.count, target: quest.target };
      }

      const before = await this.ledger.awardedTotal(input.userId, tx);
      const { event, created } = await this.ledger.createEvent(
        {
          workspaceId: input.workspaceId,
          userId: input.userId,
          source: 'QUEST',
          amount: quest.reward,
          key: questKey(input.questId, input.userId),
          evidence: `Quest verified: ${quest.name}`,
          occurredOn: parseDay(orgToday(this.clock.now())),
          questId: input.questId,
        },
        tx,
      );
      if (!created) {
        return { paid: false, reason: 'ALREADY_PAID' };
      }

      await tx.questProgress.update({
        where: { id: progress.id },
        data: { verifiedById: input.pmId, verifiedAt: this.clock.now() },
      });
      await this.levels.notifyIfLeveledUp(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        before,
        after: before + quest.reward,
      });
      return { paid: true, amount: quest.reward, eventId: event.id };
    });
  }

  /** Every quest of the workspace, newest first. All users and PMs see them. */
  async list(workspaceId: string, options: { cursor?: string | null; limit?: number } = {}): Promise<{ quests: QuestView[]; nextCursor: string | null }> {
    const skip = parseCursor(options.cursor);
    const take = Math.min(options.limit ?? MAX_PAGE, MAX_PAGE);
    const rows = await this.prisma.quest.findMany({
      where: { workspaceId },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: take + 1,
    });
    return {
      quests: rows.slice(0, take).map((q) => ({
        id: q.id,
        name: q.name,
        description: q.description,
        target: q.target,
        reward: q.reward,
        startDate: day(q.startDate),
        endDate: day(q.endDate),
      })),
      nextCursor: rows.length > take ? String(skip + take) : null,
    };
  }

  /** A user sees only their own progress. */
  async progressForUser(workspaceId: string, userId: string): Promise<ProgressView[]> {
    const rows = await this.prisma.questProgress.findMany({ where: { workspaceId, userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toProgressView);
  }

  /**
   * A PM reads the progress of every active user (and of their own archived users), each row marked
   * `managedByYou`. Only the managing PM may verify (FR-ENG-53, FR-ENG-27).
   */
  async progressForPm(workspaceId: string, pmId: string, questId?: string): Promise<PmProgressView[]> {
    const rows = await this.prisma.questProgress.findMany({
      where: { workspaceId, user: pmReadableUsers(workspaceId, pmId), ...(questId ? { questId } : {}) },
      include: { user: { select: { pmId: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((p) => ({ ...toProgressView(p), managedByYou: p.user.pmId === pmId }));
  }

  private async requireQuestAndUser(tx: Tx, ref: QuestRef) {
    const quest = await tx.quest.findFirst({
      where: { id: ref.questId, workspaceId: ref.workspaceId },
      select: { id: true, name: true, target: true, reward: true },
    });
    if (!quest) {
      throw new GrowthError('NOT_FOUND', 'Quest not found');
    }
    const user = await tx.user.findFirst({
      where: { userId: ref.userId, workspaceId: ref.workspaceId },
      select: { userId: true, pmId: true, archivedAt: true },
    });
    if (!user) {
      throw new GrowthError('NOT_FOUND', 'User not found');
    }
    if (user.pmId !== ref.pmId) {
      throw new GrowthError('FORBIDDEN_SCOPE', 'This user is not managed by you');
    }
    if (user.archivedAt) {
      throw new GrowthError('USER_ARCHIVED', 'This user is archived');
    }
    return { quest, user };
  }
}

function toProgressView(p: { questId: string; userId: string; count: number; verifiedAt: Date | null }): ProgressView {
  return { questId: p.questId, userId: p.userId, count: p.count, verifiedAt: p.verifiedAt ? p.verifiedAt.toISOString() : null };
}
