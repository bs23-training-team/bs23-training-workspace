import { AUTH_EVENT_VERSION, recordAuthEvent, type AuthEvent } from './auth-events.js';

type Created = { data: Record<string, unknown> };

// A minimal stand-in for the Prisma transaction client: it only records what
// recordAuthEvent writes. (The transactional behaviour itself is covered in
// identity-recovery.spec.ts and account-provisioning.spec.ts.)
function recorder() {
    const notifications: Created[] = [];
    const outbox: Created[] = [];
    const db = {
        notification: { create: async (args: Created) => void notifications.push(args) },
        outboxEvent: { create: async (args: Created) => void outbox.push(args) },
    };

    return { db: db as unknown as Parameters<typeof recordAuthEvent>[0], notifications, outbox };
}

const base: AuthEvent = {
    type: 'auth.account_created',
    workspaceId: 'ws-1',
    account: { role: 'TRAINEE', id: 'BS23001' },
    actorPmId: 'PM001',
};

describe('auth outbox event envelope (FR-15)', () => {
    it('carries version, aggregate and actor next to the identifiers', async () => {
        const r = recorder();
        await recordAuthEvent(r.db, base);

        expect(r.outbox).toHaveLength(1);
        expect(r.outbox[0].data).toMatchObject({
            workspaceId: 'ws-1',
            type: 'auth.account_created',
            payload: {
                accountRole: 'TRAINEE',
                accountId: 'BS23001',
                actorPmId: 'PM001',
                version: AUTH_EVENT_VERSION,
                aggregate: { type: 'User', id: 'BS23001' },
                actor: { role: 'PM', id: 'PM001' },
            },
        });
    });

    it('names a PM aggregate, and the account itself as actor when nobody else caused the event', async () => {
        const r = recorder();
        await recordAuthEvent(r.db, {
            type: 'auth.password_changed',
            workspaceId: 'ws-1',
            account: { role: 'PM', id: 'PM002' },
        });

        const payload = r.outbox[0].data.payload as Record<string, unknown>;
        expect(payload.aggregate).toEqual({ type: 'Pm', id: 'PM002' });
        expect(payload.actor).toEqual({ role: 'PM', id: 'PM002' });
        expect('actorPmId' in payload).toBe(false);
    });

    it('writes a notification for the right workspace and recipient only when asked', async () => {
        const withNote = recorder();
        await recordAuthEvent(withNote.db, {
            ...base,
            notification: { category: 'Account security', title: 't', message: 'm' },
        });
        expect(withNote.notifications).toHaveLength(1);
        expect(withNote.notifications[0].data).toMatchObject({ workspaceId: 'ws-1', userId: 'BS23001' });
        expect('pmId' in withNote.notifications[0].data).toBe(false);

        const without = recorder();
        await recordAuthEvent(without.db, base);
        expect(without.notifications).toHaveLength(0);
        expect(without.outbox).toHaveLength(1);
    });

    it('never puts an email address, password or token in the payload', async () => {
        const r = recorder();
        await recordAuthEvent(r.db, base);
        expect(JSON.stringify(r.outbox)).not.toMatch(/@|password|token|hash/i);
    });
});
