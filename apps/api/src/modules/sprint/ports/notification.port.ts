import type { Tx } from './db.js';

/**
 * The notices the sprint module creates.
 *
 * `Notification` belongs to E01, so this module writes it through this port. The category
 * names are the ones the PRD and the notification registry use: "Sprint awaiting review"
 * (the owner has not answered for a day) and "Sprint verified" (the PM recorded the owner's
 * reply). Confirm the exact strings with E01 before wiring the real implementation.
 */
export type SprintNoticeCategory = 'Sprint awaiting review' | 'Sprint verified';

export interface NoticeInput {
  workspaceId: string;
  category: SprintNoticeCategory;
  title: string;
  message: string;
  /** The page to open when the notice is clicked. */
  link?: string;
}

export interface NotificationPort {
  /** Notifies a PM. Always called inside the transaction of the change it reports. */
  notifyPm(tx: Tx, notice: NoticeInput & { pmId: string }): Promise<void>;
  /** Notifies a user. Always called inside the transaction of the change it reports. */
  notifyUser(tx: Tx, notice: NoticeInput & { userId: string }): Promise<void>;
}

/** Nest injection token for the NotificationPort provider. */
export const NOTIFICATIONS = Symbol('SPRINT_NOTIFICATIONS');
