import type { Tx } from './db.js';

/**
 * Notices growth-core creates. The category names must match the notification registry
 * owned by E01 (notifications module). Confirm the exact strings with E01 before wiring
 * the real implementation.
 */
export type GrowthNoticeCategory = 'XP decisions' | 'Level up' | 'New badge' | 'Badge revoked';

export interface NoticeInput {
  workspaceId: string;
  category: GrowthNoticeCategory;
  title: string;
  message: string;
  link?: string;
}

/**
 * Port to the notifications module (E01). Always called inside the same transaction as the
 * change it reports, so a failed notice rolls the change back and a refused change creates
 * no notice. Until E01 ships a real service, tests use FakeNotificationPort.
 */
export interface NotificationPort {
  notifyUser(tx: Tx, notice: NoticeInput & { userId: string }): Promise<void>;
  notifyPm(tx: Tx, notice: NoticeInput & { pmId: string }): Promise<void>;
}
