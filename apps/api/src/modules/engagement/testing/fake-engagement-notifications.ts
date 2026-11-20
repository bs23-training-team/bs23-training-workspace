import type { Tx } from '../../growth-core/index.js';
import type { EngagementNotice, EngagementNotificationPort } from '../ports/engagement-notification.port.js';

export type UserNotice = EngagementNotice & { userId: string };
export type PmNotice = EngagementNotice & { pmId: string };

/** Records notices in memory. `failNext` makes the next call throw, to test rollback. */
export class FakeEngagementNotifications implements EngagementNotificationPort {
  readonly userNotices: UserNotice[] = [];
  readonly pmNotices: PmNotice[] = [];
  private nextError: Error | null = null;

  failNext(error: Error): void {
    this.nextError = error;
  }

  async notifyUser(_tx: Tx, notice: UserNotice): Promise<void> {
    this.throwIfFailing();
    this.userNotices.push(notice);
  }

  async notifyPm(_tx: Tx, notice: PmNotice): Promise<void> {
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
