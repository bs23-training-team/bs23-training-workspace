/**
 * Account provisioning rules shared by the Add PM integration and the
 * operator script that creates the very first PM (E01).
 *
 * Plain functions with no Nest dependency, so the command-line script can use
 * them without starting the API. NOTHING here is reachable over HTTP.
 */

import { randomBytes } from 'node:crypto';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { nextPmId, slugify } from './account.js';
import { normalizeEmail } from './email.js';
import { hashPassword } from './password.js';

/** ADR 0003: PM IDs are "PM" + number (PM001, PM002 ...). */
export const PM_ID_FORMAT = /^PM\d{3,}$/;
export const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/**
 * Trainee IDs (User.userId, e.g. BS23001). The PRD fixes no format (open
 * question Q10), so this only guarantees what login needs: stored upper case,
 * no "@" (that would be read as an email at sign-in), no spaces, 3-32 chars.
 * A value that looks like a PM ID is refused so the two never get confused.
 */
export const USER_ID_FORMAT = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;

// Mirrors the Prisma enums Position / AttendanceMode / UserResource.
export const POSITIONS = ['FRONTEND', 'BACKEND', 'FULLSTACK', 'QA'] as const;
export const ATTENDANCE_MODES = ['PHYSICAL', 'ONLINE'] as const;
export const USER_RESOURCE_VALUES = [
    'TRAINEE',
    'CENTRAL_LND',
    'INDUSTRIAL_ATTACHMENT',
    'SBU',
] as const;

/** Strict "YYYY-MM-DD" calendar date -> that day at 00:00 UTC, else null. */
export function parseDateOnly(value: unknown): Date | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
        ? null
        : date;
}
export const PASSWORD_MIN_LENGTH = 8;
// scrypt hashes the whole input, so an absurdly long password is refused.
export const PASSWORD_MAX_LENGTH = 128;

/** Why a password is not acceptable, or null. */
export function passwordProblem(password: unknown): string | null {
    if (typeof password !== 'string') {
        return 'Password is required.';
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }

    if (password.length > PASSWORD_MAX_LENGTH) {
        return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
    }

    return null;
}

export const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002';

// The init migration's triggers (trg_pm_email / trg_user_email, ADR 0003 rule 5)
// raise a plain exception with this wording when an email already belongs to a
// PM or a user of the same workspace. Prisma does not give it a stable code, so
// the message is matched.
export const isEmailTriggerError = (error: unknown): boolean =>
    error instanceof Error && /is already used by a (User|PM)/.test(error.message);

type Db = Pick<PrismaService, 'pm' | 'user'>;

/**
 * True when the email belongs to any PM or user in ANY workspace
 * (case-insensitive). Used before creating an account, because the schema only
 * guarantees uniqueness per workspace and login looks emails up everywhere.
 */
export async function emailInUse(db: Db, email: string): Promise<boolean> {
    const where = {
        email: { equals: normalizeEmail(email), mode: 'insensitive' as const },
    };

    const [pm, user] = await Promise.all([
        db.pm.findFirst({ where, select: { pmId: true } }),
        db.user.findFirst({ where, select: { userId: true } }),
    ]);

    return Boolean(pm || user);
}

export type InitialPmInput = {
    workspaceName: string;
    pmName: string;
    email: string;
    password: string;
    /** Defaults to the next free "PM###". */
    pmId?: string;
};

/**
 * Creates a new workspace with its first PM. Meant for an operator with
 * database access (see cli/provision-initial-pm.ts), never for an HTTP route.
 *
 * - Refuses to run when ANY PM already exists, so it cannot be used to create
 *   extra workspaces or accounts later.
 * - The PM is email-verified (the operator vouches for it) and must change the
 *   password at first sign-in (mustChangePassword = true).
 */
export async function provisionInitialPm(
    prisma: Pick<PrismaService, 'pm' | 'user' | 'workspace' | 'credential' | '$transaction'>,
    input: InitialPmInput,
): Promise<{ pmId: string; workspaceId: string }> {
    const workspaceName = input.workspaceName.trim();
    const pmName = input.pmName.trim();
    const email = normalizeEmail(input.email);

    if (!workspaceName || workspaceName.length > 120) {
        throw new Error('Workspace name is required (at most 120 characters).');
    }

    if (!pmName || pmName.length > 120) {
        throw new Error('PM name is required (at most 120 characters).');
    }

    if (!EMAIL_FORMAT.test(email) || email.length > 254) {
        throw new Error('A valid PM email is required.');
    }

    const weak = passwordProblem(input.password);

    if (weak) {
        throw new Error(weak);
    }

    if (input.pmId !== undefined && !PM_ID_FORMAT.test(input.pmId)) {
        throw new Error('PM ID must look like PM001.');
    }

    if (await prisma.pm.findFirst({ select: { pmId: true } })) {
        throw new Error(
            'A PM account already exists. This command only creates the very first PM.',
        );
    }

    if (await emailInUse(prisma, email)) {
        throw new Error('That email is already used by an account.');
    }

    const passwordHash = await hashPassword(input.password);

    return prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
            data: {
                name: workspaceName,
                slug: `${slugify(workspaceName)}-${randomBytes(3).toString('hex')}`,
            },
        });

        const existing = await tx.pm.findMany({ select: { pmId: true } });
        const pmId = input.pmId ?? nextPmId(existing.map((row) => row.pmId));

        await tx.pm.create({
            data: {
                pmId,
                workspaceId: workspace.id,
                name: pmName,
                email,
                emailVerified: true,
                mustChangePassword: true,
            },
        });

        await tx.credential.create({
            data: { workspaceId: workspace.id, pmId, passwordHash },
        });

        return { pmId, workspaceId: workspace.id };
    });
}
