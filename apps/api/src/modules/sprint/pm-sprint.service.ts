import { Inject, Injectable } from '@nestjs/common';
import { SprintError } from './errors.js';
import { SprintRepository } from './sprint.repository.js';
import { NOTIFICATIONS, type NotificationPort } from './ports/notification.port.js';
import { CLOCK, type ClockPort } from './time/clock.port.js';
import { pmIdOf, workspaceIdOf, type SprintActor } from './http/actor.js';
import type { SprintTaskView } from './dto/sprint-response.dto.js';
import type { OwnerDecisionValue } from './dto/pm-sprint.dto.js';

/**
 * The PM-side sprint rules: the owner-verification reply (P7) and the no-reply job (S1).
 *
 * These live in their own service because they are the **PM's** rules, not the user's. The
 * user-side service (`sprint.service.ts`) answers "what is my day"; this one answers "has the
 * owner of this task answered yet, and who may say so".
 *
 * The rules:
 * - a PM records the owner's answer **only for their own users** (PRD BR-08, SRS DS-02.5);
 *   somebody else's task is 403 `FORBIDDEN_SCOPE`,
 * - the answer is recorded **once** (PRD BR-07): the second attempt is 409 `ALREADY_DECIDED`,
 * - the answer and the notice that reports it are written **in one transaction**, so a rolled
 *   back answer leaves no notice behind (DS-02.6),
 * - a task that needs no verification cannot be decided at all: there is no owner to answer.
 */

/** How long the owner has to answer before the PM is told (DS-09.1). */
export const NO_REPLY_AFTER_HOURS = 24;

/** The task row the PM's service works with. */
type OwnerReplyTaskRow = {
  id: string;
  workspaceId: string;
  userId: string;
  date: Date;
  title: string;
  description: string;
  plannedHours: unknown;
  actualHours: unknown;
  blocker: string;
  done: boolean;
  category: string | null;
  ownerId: string | null;
  verification: string | null;
  carriedFromId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner: { name: string } | null;
  /** The PM who manages the user the task belongs to. */
  user?: { pmId: string; name: string } | null;
};

/** Prisma returns a Decimal for a Decimal column; the API answers with a plain number. */
const toNumber = (value: unknown): number => Number(value ?? 0);

@Injectable()
export class PmSprintService {
  constructor(
    private readonly repository: SprintRepository,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(NOTIFICATIONS) private readonly notifications: NotificationPort,
  ) {}

  // ---------------------------------------------------------------------------
  // P7 — POST /pm/sprint/tasks/:id/owner-reply
  // ---------------------------------------------------------------------------

  /**
   * Records the owner's answer to a task, on behalf of the owner.
   *
   * In v1 the task owner does not sign in: the PM records the answer (PRD v1, SRS DS-02.4).
   * A real email reply is a later phase of the release plan.
   *
   * **Only for the PM's own users.** The task's user is looked up together with the PM who
   * manages them, and a task of somebody else's user is refused with 403 `FORBIDDEN_SCOPE`.
   * The check is made against the row, not against anything the client sent.
   *
   * **Decided once** (PRD BR-07). The write is a single conditional update — the row is
   * changed only while it is still `PENDING` — so two presses of the button, or two PMs at
   * the same moment, produce exactly one decision. The second attempt changes no row, and
   * that is a 409 `ALREADY_DECIDED`, not a silent overwrite.
   *
   * **The notice is inside the transaction.** The PM is told about the answer in the same
   * transaction that records it, so a rolled back answer leaves no notice behind.
   */
  async recordOwnerReply(
    actor: SprintActor,
    taskId: string,
    decision: OwnerDecisionValue,
  ): Promise<SprintTaskView> {
    const pmId = pmIdOf(actor);
    const workspaceId = workspaceIdOf(actor);

    const task = await this.repository.findTaskForOwnerReply(workspaceId, taskId);
    if (!task) {
      // A task that does not exist and a task of another workspace look the same: the caller
      // must not learn that the row exists somewhere else.
      throw new SprintError('NOT_FOUND', 'No such task');
    }

    // The scope check: the task's user must be managed by the PM who is asking.
    if (!task.user || task.user.pmId !== pmId) {
      throw new SprintError(
        'FORBIDDEN_SCOPE',
        'You can only record an answer for your own users',
      );
    }

    // A task done for oneself has no owner to answer. There is nothing to decide.
    if (!task.ownerId) {
      throw new SprintError('NOT_FOUND', 'That task needs no verification');
    }

    // A task that is already decided cannot be decided again. This is checked before the
    // write, so the common case answers without touching the database.
    if (task.verification !== 'PENDING') {
      throw new SprintError('ALREADY_DECIDED', 'That task was already answered');
    }

    const now = this.clock.now();

    const decided = await this.repository.transaction(async (tx) => {
      // The conditional update: only while the row is still PENDING.
      const changed = await this.repository.decideOwnerReply(tx, taskId, {
        verification: decision,
        ownerRepliedAt: now,
        ownerReplyById: pmId,
      });

      if (changed.count === 0) {
        // Somebody else decided it between the read and the write. The decision is final.
        throw new SprintError('ALREADY_DECIDED', 'That task was already answered');
      }

      await this.notifications.notifyPm(tx, {
        workspaceId,
        pmId,
        category: 'Sprint awaiting review',
        title: 'The owner answered',
        message: this.replyMessage(task.title, decision),
        link: '/pm/sprint',
      });

      return true;
    });

    if (!decided) {
      throw new SprintError('ALREADY_DECIDED', 'That task was already answered');
    }

    const updated = await this.repository.findTaskById(workspaceId, taskId);
    if (!updated) {
      throw new SprintError('NOT_FOUND', 'No such task');
    }

    return this.toView(updated as unknown as OwnerReplyTaskRow);
  }

  // ---------------------------------------------------------------------------
  // S1 — the no-reply job
  // ---------------------------------------------------------------------------

  /**
   * Tells the PM about the tasks whose owner has not answered for a day (DS-09).
   *
   * A task is escalated when all of these are true:
   * - it is still waiting for its owner (`verification = 'PENDING'`),
   * - the owner was asked at least 24 hours ago,
   * - the PM has not been told yet,
   * - the task is not deleted.
   *
   * **The job never tells the PM twice.** The rows are picked up with `FOR UPDATE SKIP
   * LOCKED`, so two runs at the same time work on different rows, and the alert is only
   * written when the row's `pendingAlertSentAt` was still empty. A task that was already
   * escalated — by this run or by another — is skipped.
   *
   * The job is callable directly, `runNoReplyCheck(now)`, so it can be tested at a fixed
   * moment and so a worker can call it without a request.
   *
   * @param now the moment the job runs. The clock is used when it is not given.
   * @returns how many tasks were escalated.
   */
  async runNoReplyCheck(now?: Date): Promise<number> {
    const at = now ?? this.clock.now();
    const askedBefore = new Date(at.getTime() - NO_REPLY_AFTER_HOURS * 60 * 60 * 1000);

    const workspaces = await this.repository.findWorkspacesWithPendingTasks(askedBefore);
    let escalated = 0;

    for (const workspace of workspaces) {
      const candidates = await this.repository.findStalePendingTasks(workspace.id, askedBefore);
      for (const task of candidates) {
        // A task whose user has no PM cannot be escalated to anybody.
        const owner = task.user;
        if (!owner) continue;

        const sent = await this.repository.transaction(async (tx) => {
          const changed = await this.repository.markPendingAlertSent(tx, task.id, at);
          if (changed.count === 0) {
            // Somebody else already told the PM. No second notice.
            return false;
          }

          await this.notifications.notifyPm(tx, {
            workspaceId: workspace.id,
            pmId: owner.pmId,
            category: 'Sprint awaiting review',
            title: 'A task is waiting for its owner',
            message: this.noReplyMessage(task.title),
            link: '/pm/sprint',
          });

          return true;
        });

        if (sent) escalated += 1;
      }
    }

    return escalated;
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /** The notice the PM gets when the owner answered. */
  private replyMessage(title: string, decision: OwnerDecisionValue): string {
    const outcome =
      decision === 'VERIFIED'
        ? 'The owner confirmed the task.'
        : 'The owner did not confirm the task.';
    return `${outcome} Task: "${title}".`;
  }

  /** The notice the PM gets when the owner has not answered for a day. */
  private noReplyMessage(title: string): string {
    return `The owner of "${title}" has not answered for a day.`;
  }

  /** Turns a task row into the shape the API answers with. */
  private toView(task: OwnerReplyTaskRow): SprintTaskView {
    return {
      id: task.id,
      date: task.date.toISOString().slice(0, 10),
      title: task.title,
      description: task.description,
      plannedHours: toNumber(task.plannedHours),
      actualHours: toNumber(task.actualHours),
      blocker: task.blocker,
      done: task.done,
      category: (task.category as SprintTaskView['category']) ?? null,
      ownerId: task.ownerId,
      ownerName: task.owner?.name ?? null,
      verification: (task.verification as SprintTaskView['verification']) ?? null,
      carriedFromId: task.carriedFromId,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}
