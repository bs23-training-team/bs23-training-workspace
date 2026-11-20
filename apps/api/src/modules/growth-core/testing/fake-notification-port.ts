import type { Db } from '../ports/db.js';
import type { NoticeInput, NotificationPort } from '../ports/notification.port.js';

export type UserNotice = NoticeInput & { userId: string };
export type PmNotice = NoticeInput & { pmId: string };

/** Records notices in memory instead of writing Notification and OutboxEvent rows. */
export class FakeNotificationPort implements NotificationPort {
  readonly userNotices: UserNotice[] = [];
  readonly pmNotices: PmNotice[] = [];
  private nextError: Error | null = null;

  /** Makes the next call throw, to test that a failed notice rolls the change back. */
  failNext(error: Error): void {
    this.nextError = error;
  }

  async notifyUser(_tx: Db, notice: UserNotice): Promise<void> {
    this.throwIfFailing();
    this.userNotices.push(notice);
  }

  async notifyPm(_tx: Db, notice: PmNotice): Promise<void> {
    this.throwIfFailing();
    this.pmNotices.push(notice);
  }

  private throwIfFailing(): void {
    if (this.nextError) {
      const error = this.nextError;
      this.nextError = null;
      throw error;
    }
  }
}
