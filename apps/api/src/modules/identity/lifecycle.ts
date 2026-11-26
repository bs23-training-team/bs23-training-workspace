/**
 * Departure-date job (PRD FR-AUTH-06 / FR-DIR-06, "Job - departure-date job").
 *
 * "When a user's departure date passes they become inactive: they move to the
 * Archive and are signed out." This archives every user whose departure date
 * is before today (organisation time zone, see `orgToday`), ends their
 * sessions and cancels their unused password-reset links. Their records are
 * kept; a PM reactivates a user later by giving a new departure date after
 * today (FR-DIR-07, E02).
 *
 * Plain functions with no Nest dependency so the command in
 * cli/archive-departed-users.ts and a scheduler can both use them. NOTHING here
 * is reachable over HTTP. It is safe to run any number of times (idempotent)
 * and from several instances at once (every write is conditional on
 * `archivedAt IS NULL` / `endedAt IS NULL`).
 *
 * Sign-in and every authenticated request ALSO refuse a user past the
 * departure date (account.ts `isUserInactive`), so access stops at once even
 * if this job has not run yet; the job only makes the Archive state match.
 */

import type { PrismaService } from '../../prisma/prisma.service.js';
import { orgToday } from './account.js';

/** Users archived per transaction (keeps each transaction small). */
export const ARCHIVE_BATCH_SIZE = 200;
/** Upper bound on batches per run, so a bug can never loop forever. */
const MAX_BATCHES = 500;

type LifecycleDb = Pick<PrismaService, 'user' | 'session' | 'authToken' | '$transaction'>;

/** Users that are past their departure date and not yet archived. */
export function departedUsersWhere(now: Date = new Date()) {
    return { archivedAt: null, departureDate: { lt: orgToday(now) } };
}

/** Read-only: how many users the job would archive right now. */
export async function countDepartedUsers(
    db: Pick<PrismaService, 'user'>,
    now: Date = new Date(),
): Promise<number> {
    return db.user.count({ where: departedUsersWhere(now) });
}

/**
 * Archives departed users, ends their sessions and invalidates their unused
 * tokens. Returns how many users were archived by THIS run.
 */
export async function archiveDepartedUsers(
    db: LifecycleDb,
    now: Date = new Date(),
): Promise<{ archived: number }> {
    let archived = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
        const due = await db.user.findMany({
            where: departedUsersWhere(now),
            select: { userId: true },
            orderBy: { userId: 'asc' },
            take: ARCHIVE_BATCH_SIZE,
        });

        if (due.length === 0) {
            break;
        }

        const ids = due.map((row) => row.userId);

        const count = await db.$transaction(async (tx) => {
            const result = await tx.user.updateMany({
                where: { userId: { in: ids }, archivedAt: null },
                data: { archivedAt: now },
            });

            // Signed out: every live session of these users ends.
            await tx.session.updateMany({
                where: { userId: { in: ids }, endedAt: null },
                data: { endedAt: now },
            });

            // Unused reset links stop working too.
            await tx.authToken.updateMany({
                where: { userId: { in: ids }, usedAt: null },
                data: { usedAt: now },
            });

            return result.count;
        });

        archived += count;

        // Another instance archived the same rows first: nothing left for us.
        if (count === 0 || due.length < ARCHIVE_BATCH_SIZE) {
            break;
        }
    }

    return { archived };
}
