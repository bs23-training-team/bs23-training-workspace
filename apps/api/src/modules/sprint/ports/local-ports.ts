import { Injectable } from '@nestjs/common';
import type { Tx } from './db.js';
import type { ApprovalMailInput, ApprovalMailPort } from './approval-mail.port.js';
import type { NoticeInput, NotificationPort } from './notification.port.js';
import type { XpAwardInput, XpLedgerPort } from './xp-ledger.port.js';
import type { CalendarPort } from './calendar.port.js';
import { isWeekend, previousDaySkippingWeekend } from '../time/org-time.js';

/**
 * The local implementations of the sprint module's ports.
 *
 * Each one writes through the **transaction handle it is given**, so the row it writes and the
 * change it reports succeed or fail together (DS-02.1).
 *
 * The tables these write belong to other modules (`MailDelivery` to E08, `XpEvent` to E09,
 * `Notification` to E01). This module must not write them directly
 * (architecture.md section 3.3, rule 5), so the writes go through `OutboxEvent`, the sanctioned
 * cross-module channel, and the owning module picks them up. When that module ships a real
 * service, the provider in `sprint.module.ts` is swapped and nothing else changes.
 */

/**
 * The outbox event types this module emits. The owning module reads them by type.
 * - `xp.sprint_on_time` -> E09 (growth-core)
 * - `mail.task_owner_approval` -> E08 (the mail worker)
 * - `notification.sprint` -> E01 (the notification worker)
 */
export const OUTBOX_TYPES = {
  xpOnTimeSprint: 'xp.sprint_on_time',
  approvalMail: 'mail.task_owner_approval',
  notification: 'notification.sprint',
} as const;

async function writeOutbox(
  tx: Tx,
  workspaceId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await tx.outboxEvent.create({
    data: { workspaceId, type, payload: payload as never },
  });
}

/**
 * The on-time sprint XP event.
 *
 * The XP amount itself is read from `XpRule.onTimeSprint` by the caller (reading another
 * module's table is allowed); this port only records that the award is due.
 */
@Injectable()
export class OutboxXpLedger implements XpLedgerPort {
  async awardOnTimeSprint(tx: Tx, input: XpAwardInput): Promise<void> {
    await writeOutbox(tx, input.workspaceId, OUTBOX_TYPES.xpOnTimeSprint, {
      userId: input.userId,
      day: input.day,
      amount: input.amount,
      submissionId: input.submissionId,
      source: 'ON_TIME_SPRINT',
      // The key E09 uses to make the award once.
      key: `sprint:${input.userId}:${input.day}`,
    });
  }
}

/**
 * The approval mail a task owner receives.
 *
 * The mail is not sent here: the request is recorded inside the task's transaction and E08's
 * mail worker sends it later. A rolled-back task therefore leaves no mail behind (DS-02.1).
 */
@Injectable()
export class OutboxApprovalMail implements ApprovalMailPort {
  async requestOwnerApproval(tx: Tx, input: ApprovalMailInput): Promise<void> {
    await writeOutbox(tx, input.workspaceId, OUTBOX_TYPES.approvalMail, {
      sprintTaskId: input.sprintTaskId,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      purpose: 'TASK_OWNER_APPROVAL',
    });
  }
}

/**
 * The notices the sprint module creates.
 *
 * The recipient and the notice itself are written as one outbox event, so the notice is
 * created only when the change it reports is committed.
 */
@Injectable()
export class OutboxNotification implements NotificationPort {
  async notifyPm(tx: Tx, notice: NoticeInput & { pmId: string }): Promise<void> {
    await writeOutbox(tx, notice.workspaceId, OUTBOX_TYPES.notification, {
      recipient: { kind: 'PM', pmId: notice.pmId },
      category: notice.category,
      title: notice.title,
      message: notice.message,
      link: notice.link ?? null,
    });
  }

  async notifyUser(tx: Tx, notice: NoticeInput & { userId: string }): Promise<void> {
    await writeOutbox(tx, notice.workspaceId, OUTBOX_TYPES.notification, {
      recipient: { kind: 'USER', userId: notice.userId },
      category: notice.category,
      title: notice.title,
      message: notice.message,
      link: notice.link ?? null,
    });
  }
}

/**
 * The working-day rule.
 *
 * The weekend (Friday and Saturday) is settled and lives in `time/org-time.ts`. The public
 * holiday part is E07's, and E07's module is still an empty skeleton, so the holiday lookup
 * reads the `PublicHoliday` table directly — reading another module's table is allowed
 * (architecture.md section 3.3, rule 5). When E07 ships its calendar service, this
 * implementation is swapped for one that calls it.
 */
@Injectable()
export class PrismaCalendar implements CalendarPort {
  /**
   * The last working day strictly before `day`: the previous day, skipping Friday and
   * Saturday, then skipping any public holiday.
   */
  async previousWorkingDay(tx: Tx, workspaceId: string, day: string): Promise<string | null> {
    let candidate = previousDaySkippingWeekend(day);
    // A public holiday can fall on any day, so keep stepping back until the day is free.
    // The weekend is already excluded, so only a holiday can stop the walk here.
    for (let guard = 0; guard < 366; guard += 1) {
      if (!(await this.isPublicHoliday(tx, workspaceId, candidate))) return candidate;
      candidate = previousDaySkippingWeekend(candidate);
    }
    return null;
  }

  async isWorkingDay(tx: Tx, workspaceId: string, day: string): Promise<boolean> {
    if (isWeekend(day)) return false;
    return !(await this.isPublicHoliday(tx, workspaceId, day));
  }

  private async isPublicHoliday(tx: Tx, workspaceId: string, day: string): Promise<boolean> {
    const asDate = new Date(`${day}T00:00:00Z`);
    const row = await tx.publicHoliday.findFirst({
      where: { workspaceId, date: asDate },
      select: { id: true },
    });
    return row !== null;
  }
}
