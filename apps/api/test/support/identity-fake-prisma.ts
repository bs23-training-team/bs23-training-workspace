/**
 * In-memory stand-in for PrismaService, used only by the E01 identity specs.
 *
 * It mimics the parts of the FINAL v1 schema (apps/api/prisma/schema/schema.prisma,
 * ADR 0003) that the identity module touches: Workspace, Pm, User, Credential,
 * AuthToken and Session. Like the real database it:
 *   - rejects a duplicate primary key / unique value (Prisma error code P2002),
 *   - rejects a create that is missing a required column,
 *   - requires EXACTLY ONE of pmId / userId on Credential, AuthToken, Session
 *     (the schema's CHECK constraints),
 *   - rolls a transaction back when the callback throws.
 *
 * It is NOT Prisma: it supports only the query shapes the identity service uses.
 * The real schema is checked separately (`pnpm db:generate` + `pnpm typecheck`).
 */

import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

type TableName =
    | 'workspace' | 'pm' | 'user' | 'credential' | 'authToken' | 'session' | 'team' | 'membership'
    | 'notification' | 'outboxEvent';

type TableDef = {
    primaryKey: string;
    uuid: boolean;
    required: string[];
    unique: string[][];
    defaults: Row;
    oneOwner: boolean;
};

const TABLES: Record<TableName, TableDef> = {
    workspace: {
        primaryKey: 'id',
        uuid: true,
        required: ['name', 'slug'],
        unique: [['slug']],
        defaults: {},
        oneOwner: false,
    },
    pm: {
        primaryKey: 'pmId',
        uuid: false,
        required: ['pmId', 'workspaceId', 'email', 'name'],
        unique: [['workspaceId', 'email']],
        defaults: { mustChangePassword: false, emailVerified: false, photoPath: null, bio: null },
        oneOwner: false,
    },
    user: {
        primaryKey: 'userId',
        uuid: false,
        required: [
            'userId', 'workspaceId', 'email', 'name', 'resource', 'pmId',
            'position', 'attendanceMode', 'onboardDate',
        ],
        unique: [['workspaceId', 'email']],
        defaults: {
            mustChangePassword: false,
            emailVerified: false,
            departureDate: null,
            archivedAt: null,
            skillAssessmentMinutes: null,
            skillAssessmentMarks: null,
        },
        oneOwner: false,
    },
    credential: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'passwordHash'],
        unique: [['pmId'], ['userId']],
        defaults: { passwordChangedAt: null },
        oneOwner: true,
    },
    authToken: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'type', 'tokenHash', 'expiresAt'],
        unique: [['tokenHash']],
        defaults: { usedAt: null },
        oneOwner: true,
    },
    session: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'tokenHash', 'device', 'expiresAt'],
        unique: [['tokenHash']],
        defaults: { remembered: false, endedAt: null },
        oneOwner: true,
    },
    // FR-14 / FR-15: identity notifications (a row has a pmId OR a userId) and outbox events.
    notification: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'category', 'title', 'message'],
        unique: [],
        defaults: { link: null, retakeRequestId: null, readAt: null },
        oneOwner: true,
    },
    outboxEvent: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'type', 'payload'],
        unique: [],
        defaults: { status: 'PENDING', attempts: 0, lastError: null, processedAt: null, availableAt: new Date() },
        oneOwner: false,
    },
    // E02 tables the Add Trainee workflow writes to (Membership) and reads (Team).
    team: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'name', 'pmId'],
        unique: [['workspaceId', 'name']],
        defaults: { archivedAt: null },
        oneOwner: false,
    },
    membership: {
        primaryKey: 'id',
        uuid: true,
        required: ['workspaceId', 'teamId', 'userId'],
        unique: [['teamId', 'userId']],
        defaults: { leftAt: null },
        oneOwner: false,
    },
};

const AUTH_TOKEN_TYPES = ['EMAIL_VERIFICATION', 'PASSWORD_RESET'];
const USER_RESOURCES = ['TRAINEE', 'CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU'];

function constraintError(message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code: 'P2002' });
}

function compare(value: any, condition: any): boolean {
    if (condition === null) {
        return value === null || value === undefined;
    }

    if (condition instanceof Date) {
        return value instanceof Date && value.getTime() === condition.getTime();
    }

    if (typeof condition !== 'object') {
        return value === condition;
    }

    return Object.entries(condition).every(([operator, expected]) => {
        switch (operator) {
            case 'equals':
                return (condition as Row).mode === 'insensitive'
                    ? typeof value === 'string' &&
                          value.toLowerCase() === String(expected).toLowerCase()
                    : compare(value, expected);
            case 'mode':
                return true;
            case 'not':
                return !compare(value, expected);
            case 'in':
                return (expected as any[]).includes(value);
            case 'gt':
                return value !== null && value !== undefined && value > (expected as any);
            case 'gte':
                return value !== null && value !== undefined && value >= (expected as any);
            case 'lt':
                return value !== null && value !== undefined && value < (expected as any);
            case 'lte':
                return value !== null && value !== undefined && value <= (expected as any);
            default:
                throw new Error(`fake prisma: unsupported operator "${operator}"`);
        }
    });
}

function matches(row: Row, where: Row | undefined): boolean {
    if (!where) {
        return true;
    }

    return Object.entries(where).every(([key, condition]) => {
        if (key === 'AND') {
            return ([] as Row[]).concat(condition).every((w) => matches(row, w));
        }
        if (key === 'OR') {
            return (condition as Row[]).some((w) => matches(row, w));
        }
        if (key === 'NOT') {
            return !([] as Row[]).concat(condition).some((w) => matches(row, w));
        }
        return compare(row[key], condition);
    });
}

export class FakePrisma {
    /**
     * The email triggers (global_unique_email migration). A test turns this off only to build the
     * data that existed BEFORE that migration (two accounts sharing an email), to prove the API
     * still fails closed on it.
     */
    enforceEmailTriggers = true;

    private data: Record<TableName, Row[]> = {
        workspace: [],
        pm: [],
        user: [],
        credential: [],
        authToken: [],
        session: [],
        team: [],
        membership: [],
        notification: [],
        outboxEvent: [],
    };

    workspace = this.delegate('workspace');
    pm = this.delegate('pm');
    user = this.delegate('user');
    credential = this.delegate('credential');
    authToken = this.delegate('authToken');
    session = this.delegate('session');
    team = this.delegate('team');
    membership = this.delegate('membership');
    notification = this.delegate('notification');
    outboxEvent = this.delegate('outboxEvent');

    /** Raw rows, for assertions. */
    rows(table: TableName): Row[] {
        return this.data[table];
    }

    async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
        const snapshot = structuredClone(this.data);

        try {
            return await fn(this);
        } catch (error) {
            this.data = snapshot;
            throw error;
        }
    }

    // ----- test helpers: insert rows the way E02 / the seed would -----------

    addWorkspace(overrides: Row = {}): Row {
        return this.insert('workspace', { name: 'BS23 Training', slug: 'bs23', ...overrides });
    }

    addPm(
        passwordHash: string,
        overrides: Row = {},
    ): Row {
        const pm = this.insert('pm', {
            pmId: 'PM001',
            workspaceId: this.ensureWorkspaceId(overrides.workspaceId),
            name: 'Demo PM',
            email: 'pm001@bs23.test',
            emailVerified: true,
            ...overrides,
        });
        this.insert('credential', {
            workspaceId: pm.workspaceId,
            pmId: pm.pmId,
            passwordHash,
        });
        return pm;
    }

    addUser(
        passwordHash: string,
        overrides: Row = {},
    ): Row {
        const user = this.insert('user', {
            userId: 'BS23001',
            workspaceId: this.ensureWorkspaceId(overrides.workspaceId),
            name: 'Demo User',
            email: 'bs23001@bs23.test',
            emailVerified: true,
            resource: 'TRAINEE',
            pmId: 'PM001',
            position: 'BACKEND',
            attendanceMode: 'ONLINE',
            onboardDate: new Date('2026-01-01T00:00:00Z'),
            ...overrides,
        });
        this.insert('credential', {
            workspaceId: user.workspaceId,
            userId: user.userId,
            passwordHash,
        });
        return user;
    }

    addTeam(overrides: Row = {}): Row {
        return this.insert('team', {
            workspaceId: this.ensureWorkspaceId(overrides.workspaceId),
            name: 'Team Alpha',
            pmId: 'PM001',
            ...overrides,
        });
    }

    private ensureWorkspaceId(given?: string): string {
        if (given) {
            return given;
        }
        return (this.data.workspace[0] ?? this.addWorkspace()).id;
    }

    // ----- engine -----------------------------------------------------------

    insert(table: TableName, input: Row): Row {
        const def = TABLES[table];
        const now = new Date();
        const row: Row = { ...def.defaults, ...input };

        for (const column of def.required) {
            if (row[column] === undefined || row[column] === null) {
                throw new Error(`fake prisma: ${table}.${column} is required`);
            }
        }

        if (def.uuid && row[def.primaryKey] === undefined) {
            row[def.primaryKey] = randomUUID();
        }

        if (def.oneOwner) {
            const owners = [row.pmId, row.userId].filter((v) => v !== undefined && v !== null);
            if (owners.length !== 1) {
                throw new Error(`fake prisma: ${table} needs exactly one of pmId / userId (CHECK)`);
            }
            row.pmId ??= null;
            row.userId ??= null;
        }

        if (table === 'authToken' && !AUTH_TOKEN_TYPES.includes(row.type)) {
            throw new Error(`fake prisma: invalid AuthTokenType "${row.type}"`);
        }
        if (table === 'user' && !USER_RESOURCES.includes(row.resource)) {
            throw new Error(`fake prisma: invalid UserResource "${row.resource}"`);
        }
        if (table === 'session') {
            row.lastSeenAt ??= now;
        }

        this.checkEmailTrigger(table, row);

        const keys = [[def.primaryKey], ...def.unique];
        for (const columns of keys) {
            const values = columns.map((c) => row[c]);
            if (values.some((v) => v === undefined || v === null)) {
                continue;
            }
            const clash = this.data[table].some((other) =>
                columns.every((c) => other[c] === row[c]),
            );
            if (clash) {
                throw constraintError(
                    `Unique constraint failed on ${table}(${columns.join(', ')})`,
                );
            }
        }

        row.createdAt ??= now;
        row.updatedAt ??= now;
        this.data[table].push(row);
        return { ...row };
    }

    // The triggers trg_pm_email / trg_user_email (init migration, widened by the migration
    // "global_unique_email"): an email belongs to ONE account in the whole system, whatever the
    // table and the workspace. They raise a plain exception, not a Prisma P2002.
    private checkEmailTrigger(table: TableName, row: Row) {
        if (!this.enforceEmailTriggers || (table !== 'pm' && table !== 'user')) {
            return;
        }

        const key = table === 'pm' ? 'pmId' : 'userId';
        const email = String(row.email).toLowerCase();

        for (const other of ['pm', 'user'] as const) {
            const clash = this.data[other].find(
                (existing) =>
                    String(existing.email).toLowerCase() === email &&
                    !(other === table && existing[key] === row[key]),
            );

            if (clash) {
                throw new Error(`email ${row.email} is already used by a ${other === 'user' ? 'User' : 'PM'}`);
            }
        }
    }

    private project(table: TableName, row: Row, args: Row = {}): Row {
        let result: Row = { ...row };

        if (args.select) {
            result = {};
            for (const [key, value] of Object.entries(args.select)) {
                if (value === true) {
                    result[key] = row[key];
                } else if (value) {
                    result[key] = this.relation(table, row, key, value as Row);
                }
            }
            return result;
        }

        for (const [key, value] of Object.entries(args.include ?? {})) {
            if (value) {
                result[key] = this.relation(
                    table,
                    row,
                    key,
                    value === true ? {} : (value as Row),
                );
            }
        }

        return result;
    }

    private relation(table: TableName, row: Row, name: string, args: Row): Row | null {
        const target: TableName | null =
            name === 'credential' ? 'credential'
            : name === 'pm' ? 'pm'
            : name === 'user' ? 'user'
            : null;

        if (!target) {
            throw new Error(`fake prisma: unsupported relation "${name}" on ${table}`);
        }

        let found: Row | undefined;

        if (table === 'pm' && name === 'credential') {
            found = this.data.credential.find((c) => c.pmId === row.pmId);
        } else if (table === 'user' && name === 'credential') {
            found = this.data.credential.find((c) => c.userId === row.userId);
        } else if (name === 'pm') {
            found = row.pmId ? this.data.pm.find((p) => p.pmId === row.pmId) : undefined;
        } else if (name === 'user') {
            found = row.userId ? this.data.user.find((u) => u.userId === row.userId) : undefined;
        }

        return found ? this.project(target, found, args) : null;
    }

    private delegate(table: TableName) {
        const find = (where?: Row) => this.data[table].filter((row) => matches(row, where));

        return {
            findUnique: async (args: Row) => {
                const row = find(args.where)[0];
                return row ? this.project(table, row, args) : null;
            },
            findFirst: async (args: Row = {}) => {
                const row = find(args.where)[0];
                return row ? this.project(table, row, args) : null;
            },
            findMany: async (args: Row = {}) => {
                let rows = find(args.where);
                if (args.orderBy) {
                    const [[field, direction]] = Object.entries(args.orderBy) as [string, string][];
                    rows = [...rows].sort((a, b) =>
                        (a[field] > b[field] ? 1 : a[field] < b[field] ? -1 : 0) *
                        (direction === 'desc' ? -1 : 1),
                    );
                }
                if (args.skip) rows = rows.slice(args.skip);
                if (args.take !== undefined) rows = rows.slice(0, args.take);
                return rows.map((row) => this.project(table, row, args));
            },
            count: async (args: Row = {}) => find(args.where).length,
            create: async (args: Row) => {
                const row = this.insert(table, args.data);
                return this.project(table, row, args);
            },
            update: async (args: Row) => {
                const row = find(args.where)[0];
                if (!row) {
                    throw Object.assign(new Error('Record not found'), { code: 'P2025' });
                }
                if (args.data.email !== undefined) {
                    this.checkEmailTrigger(table, { ...row, email: args.data.email });
                }
                Object.assign(row, args.data, { updatedAt: new Date() });
                return this.project(table, row, args);
            },
            updateMany: async (args: Row) => {
                const rows = find(args.where);
                for (const row of rows) {
                    Object.assign(row, args.data, { updatedAt: new Date() });
                }
                return { count: rows.length };
            },
            upsert: async (args: Row) => {
                const row = find(args.where)[0];
                if (row) {
                    Object.assign(row, args.update, { updatedAt: new Date() });
                    return this.project(table, row, args);
                }
                return this.project(table, this.insert(table, args.create), args);
            },
        };
    }
}
