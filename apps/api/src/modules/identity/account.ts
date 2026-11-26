/**
 * Accounts and roles under the final v1 schema (E01).
 *
 * The schema has two login tables (ADR 0003, docs/adr/0003-login-ids-as-primary-keys.md):
 *   - `Pm`   primary key `pmId`   (e.g. "PM002")   -> login role PM
 *   - `User` primary key `userId` (e.g. "BS23001") -> login role USER
 * There is NO role column. The role is the table the person was found in.
 * Per the PRD every non-PM account (Trainee, Central L&D, Industrial
 * Attachment, SBU) has the login role USER, and lands on
 * /trainee/dashboard; the Resources value is only informational here.
 *
 * Credential, AuthToken and Session each point at exactly one of the two
 * tables through `pmId` or `userId` (a database CHECK enforces "exactly one").
 *
 * Everything in this file is pure (no Nest, no database) so it is easy to
 * unit test.
 */

export type AuthRole = 'PM' | 'USER';

/** The signed-in person as the API and the web app see them. */
export type Account = {
    role: AuthRole;
    /** `Pm.pmId` for a PM, `User.userId` for a user. */
    id: string;
    workspaceId: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    /** Users only: TRAINEE | CENTRAL_LND | INDUSTRIAL_ATTACHMENT | SBU. */
    resource?: string;
};

/** Columns read from `Pm` (use as a Prisma `select`). */
export const PM_FIELDS = {
    pmId: true,
    workspaceId: true,
    name: true,
    email: true,
    mustChangePassword: true,
    emailVerified: true,
} as const;

/** Columns read from `User` (use as a Prisma `select`). */
export const USER_FIELDS = {
    userId: true,
    workspaceId: true,
    name: true,
    email: true,
    mustChangePassword: true,
    emailVerified: true,
    resource: true,
    pmId: true,
    archivedAt: true,
    departureDate: true,
} as const;

export type PmRow = {
    pmId: string;
    workspaceId: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    emailVerified: boolean;
};

export type UserRow = {
    userId: string;
    workspaceId: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    emailVerified: boolean;
    resource: string;
    pmId: string;
    archivedAt: Date | null;
    departureDate: Date | null;
};

export function accountFromPm(pm: PmRow): Account {
    return {
        role: 'PM',
        id: pm.pmId,
        workspaceId: pm.workspaceId,
        name: pm.name,
        email: pm.email,
        mustChangePassword: pm.mustChangePassword,
    };
}

export function accountFromUser(user: UserRow): Account {
    return {
        role: 'USER',
        id: user.userId,
        workspaceId: user.workspaceId,
        name: user.name,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        resource: user.resource,
    };
}

/**
 * The organisation's local time zone. The PRD says dates and "today" use the
 * organisation's local time; the final SRS names Asia/Dhaka (no daylight
 * saving), which is also the team's calendar.
 */
export const ORG_TIME_ZONE = 'Asia/Dhaka';

/**
 * Today's calendar date in the organisation's time zone, as that date at
 * 00:00 UTC (the same shape `User.departureDate` is stored in), so the two
 * can be compared directly.
 */
export function orgToday(now: Date = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: ORG_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now); // "YYYY-MM-DD"

    return new Date(`${parts}T00:00:00.000Z`);
}

/**
 * A user is inactive once archived, or once the departure date has PASSED
 * (PRD FR-AUTH-06 / FR-DIR-06: "when a user's departure date passes ... they
 * move to the Archive and are signed out"; the check runs at sign-in and on
 * every request). `departureDate` is a calendar date, so the user is still
 * active on the departure date itself and inactive from the next day in the
 * organisation's local time.
 */
export function isUserInactive(
    user: Pick<UserRow, 'archivedAt' | 'departureDate'>,
    now: Date = new Date(),
): boolean {
    return (
        user.archivedAt !== null ||
        (user.departureDate !== null &&
            user.departureDate.getTime() < orgToday(now).getTime())
    );
}

/** Why an existing account may not sign in (null = it may). */
export type SignInBlock = 'EMAIL_NOT_VERIFIED' | 'INACTIVE' | null;

/** FR-AUTH-04: a PM cannot sign in until their email is verified. */
export function pmSignInBlock(pm: Pick<PmRow, 'emailVerified'>): SignInBlock {
    return pm.emailVerified ? null : 'EMAIL_NOT_VERIFIED';
}

/** PRD section 7 (US-04, US-06): the exact messages shown for each block. */
export function signInBlockMessage(block: Exclude<SignInBlock, null>): string {
    return block === 'EMAIL_NOT_VERIFIED'
        ? 'Verify your email before signing in.'
        : 'This account is inactive. Ask your PM to activate it.';
}

export function userSignInBlock(
    user: Pick<UserRow, 'archivedAt' | 'departureDate'>,
    now: Date = new Date(),
): SignInBlock {
    return isUserInactive(user, now) ? 'INACTIVE' : null;
}

/** The `pmId` / `userId` columns that point a row at its owner. */
export function ownerData(
    role: AuthRole,
    id: string,
): { pmId: string } | { userId: string } {
    return role === 'PM' ? { pmId: id } : { userId: id };
}

/**
 * Finds the account a Session row belongs to, with the reason it may not be
 * used (if any). Returns null when the row has no owner (which the database
 * CHECK should make impossible).
 */
export function resolveSessionOwner(
    session: { pm?: PmRow | null; user?: UserRow | null },
    now: Date = new Date(),
): { account: Account; block: SignInBlock } | null {
    if (session.pm) {
        return {
            account: accountFromPm(session.pm),
            block: pmSignInBlock(session.pm),
        };
    }

    if (session.user) {
        return {
            account: accountFromUser(session.user),
            block: userSignInBlock(session.user, now),
        };
    }

    return null;
}

/** The fields returned to the web app (never a hash or a token). */
export function toSessionUser(account: Account) {
    return {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        workspaceId: account.workspaceId,
        mustChangePassword: account.mustChangePassword,
        ...(account.resource ? { resource: account.resource } : {}),
    };
}

// ---------------------------------------------------------------------------
// PM ID allocation (ADR 0003: PMs are "PM" + number, never changed or reused)
// ---------------------------------------------------------------------------

const PM_ID_PATTERN = /^PM(\d+)$/;

/**
 * The next free PM ID: one more than the highest existing "PM<number>",
 * written with at least 3 digits ("PM001"). PM rows are never deleted, so a
 * number is never handed out twice; the primary key rejects a concurrent
 * duplicate and the caller retries.
 */
export function nextPmId(existingIds: readonly string[]): string {
    let highest = 0;

    for (const id of existingIds) {
        const match = PM_ID_PATTERN.exec(id);
        if (match) {
            highest = Math.max(highest, Number(match[1]));
        }
    }

    return `PM${String(highest + 1).padStart(3, '0')}`;
}

/** URL-safe workspace slug from a display name, e.g. "Jane Doe" -> "jane-doe". */
export function slugify(name: string): string {
    const slug = name
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);

    return slug || 'workspace';
}
