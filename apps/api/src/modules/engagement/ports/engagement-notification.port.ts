import type { Tx } from '../../growth-core/index.js';

/** The notices engagement creates. Confirm the exact category strings with E01 (notifications). */
export type EngagementNoticeCategory = 'Kudos received' | 'Suspicious kudos';

export interface EngagementNotice {
  workspaceId: string;
  category: EngagementNoticeCategory;
  title: string;
  message: string;
}

/**
 * Port to the notifications module (E01), called inside the same transaction as the change it
 * reports. Until E01 ships a real service, a no-op stands in and tests use a fake.
 */
export interface EngagementNotificationPort {
  notifyUser(tx: Tx, notice: EngagementNotice & { userId: string }): Promise<void>;
  notifyPm(tx: Tx, notice: EngagementNotice & { pmId: string }): Promise<void>;
}

export const ENGAGEMENT_NOTIFICATIONS = Symbol('ENGAGEMENT_NOTIFICATIONS');

/** Stand-in until E01's notifications service exists: swap this provider, nothing else. */
export class NoopEngagementNotifications implements EngagementNotificationPort {
  async notifyUser(): Promise<void> {}
  async notifyPm(): Promise<void> {}
}
