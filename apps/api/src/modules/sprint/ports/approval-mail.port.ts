import type { Tx } from './db.js';

/**
 * The approval mail a task owner receives when a task needs their verification.
 *
 * DS-02.1 asks for the task and its mail request to be written in **one transaction**, so the
 * port takes the transaction handle. The local implementation writes the `MailDelivery` row
 * itself; `MailDelivery` belongs to E08, so this is the sanctioned channel (the port's
 * implementation is what E06 owns, the table is E08's).
 *
 * `MailService` in the reports module (E08) is the shared sender and already carries the
 * `TASK_OWNER_APPROVAL` purpose and a `sprintTaskId`. It is used for sending later; the row is
 * created here so it can be part of the same transaction as the task.
 */
export interface ApprovalMailInput {
  workspaceId: string;
  /** The task the owner has to verify. */
  sprintTaskId: string;
  /** The owner's email (`TaskOwner.email`). */
  recipient: string;
  subject: string;
  /** The plain-text body of the mail. */
  body: string;
}

export interface ApprovalMailPort {
  /**
   * Records the request for an approval mail. Must not send anything itself: the mail is
   * delivered by E08's mail worker later, so a rolled-back task leaves no mail behind.
   */
  requestOwnerApproval(tx: Tx, input: ApprovalMailInput): Promise<void>;
}

/** Nest injection token for the ApprovalMailPort provider. */
export const APPROVAL_MAIL = Symbol('APPROVAL_MAIL');
