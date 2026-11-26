import type { PrismaService } from '../../prisma/prisma.service.js';
import { ownerData, type AuthRole } from './account.js';

/**
 * E01 SRS FR-14 (notifications) and FR-15 (OutboxEvent).
 *
 * Both use tables of the approved schema (`Notification`, `OutboxEvent`); no
 * schema change is needed. Every row is written inside the SAME database
 * transaction as the change it describes, so an event exists if and only if
 * the change was committed.
 *
 * WHICH events are written is an open question in the SRS (OQ-08: "Which
 * authentication events must be written to OutboxEvent, and who consumes
 * them?"). The list below is therefore PROPOSED, not agreed:
 *
 *   auth.account_created            Add PM / Add Trainee      (+ notification)
 *   auth.password_changed           signed-in password change (+ notification)
 *   auth.password_reset_completed   reset by emailed link     (+ notification)
 *   auth.invitation_created         trainee invited / re-invited (pending approval)
 *   auth.invitation_accepted        trainee activated by link   (pending approval)
 *
 * Payloads hold identifiers only (role, account ID, acting PM ID, plus the
 * envelope fields version / aggregate / actor): never an
 * email address, password, token or hash. Nothing in E01 consumes the outbox;
 * the schema comment names "mail.report" / "notification.email" as examples of
 * the consumers' types, so these are namespaced `auth.*` to stay separate.
 */
export type AuthEventType =
    | 'auth.account_created'
    | 'auth.password_changed'
    | 'auth.password_reset_completed'
    // E01 SRS FR-09 / FR-10. Written only by the invitation flow, which is
    // waiting for schema approval (see pending-invitation/README.md).
    | 'auth.invitation_created'
    | 'auth.invitation_accepted';

export type AuthEvent = {
    type: AuthEventType;
    /** The workspace of the account the event is about. */
    workspaceId: string;
    /** The account the event is about (and the notification recipient). */
    account: { role: AuthRole; id: string };
    /** The PM who caused it, when it was not the account itself. */
    actorPmId?: string;
    /** Omit for an outbox-only event. */
    notification?: { category: string; title: string; message: string; link?: string };
};

/** Bump when the payload shape changes in a way a consumer must notice. */
export const AUTH_EVENT_VERSION = 1;

type Db = Pick<PrismaService, 'notification' | 'outboxEvent'>;

/** Use with the transaction client: `recordAuthEvent(tx, {...})`. */
export async function recordAuthEvent(db: Db, event: AuthEvent): Promise<void> {
    if (event.notification) {
        await db.notification.create({
            data: {
                workspaceId: event.workspaceId,
                ...ownerData(event.account.role, event.account.id),
                category: event.notification.category,
                title: event.notification.title,
                message: event.notification.message,
                link: event.notification.link ?? null,
            },
        });
    }

    await db.outboxEvent.create({
        data: {
            workspaceId: event.workspaceId,
            type: event.type,
            payload: {
                accountRole: event.account.role,
                accountId: event.account.id,
                ...(event.actorPmId ? { actorPmId: event.actorPmId } : {}),
                // Event envelope (repo SRS: "unique ID/type/version/workspace/
                // aggregate/actor/time"). The unique ID, type, workspace and
                // creation time are the OutboxEvent columns (id, type,
                // workspaceId, createdAt); the rest travels here so a consumer
                // can deduplicate and route without reading any other table.
                version: AUTH_EVENT_VERSION,
                aggregate: {
                    type: event.account.role === 'PM' ? 'Pm' : 'User',
                    id: event.account.id,
                },
                actor: event.actorPmId
                    ? { role: 'PM', id: event.actorPmId }
                    : { role: event.account.role, id: event.account.id },
            },
        },
    });
}

export const SECURITY_CATEGORY = 'Account security';
