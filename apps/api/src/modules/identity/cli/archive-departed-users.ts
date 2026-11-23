/**
 * Operator command: the daily departure-date job (PRD FR-AUTH-06 / FR-DIR-06).
 *
 * Archives users whose departure date has passed and signs them out. Schedule
 * it once a day (cron, a platform scheduler or a CI job). It does not start the
 * API and is not reachable over HTTP.
 *
 *   cd apps/api
 *   pnpm exec tsx src/modules/identity/cli/archive-departed-users.ts          # dry run
 *   pnpm exec tsx src/modules/identity/cli/archive-departed-users.ts --yes    # archive
 *
 * Without --yes it only COUNTS the users it would archive and changes nothing.
 * It prints which database it targets (never the credentials).
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../generated/prisma/client.js';
import { archiveDepartedUsers, countDepartedUsers } from '../lifecycle.js';

async function main() {
    const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

    if (!connectionString) {
        throw new Error('DATABASE_URL is not set (apps/api/.env).');
    }

    const target = new URL(connectionString);
    console.log(`Target database: ${target.hostname}:${target.port || '5432'}${target.pathname}`);

    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    try {
        if (!process.argv.includes('--yes')) {
            const due = await countDepartedUsers(prisma);
            console.log(`${due} user(s) are past their departure date and not archived.`);
            console.log('Nothing was changed. Run again with --yes to archive them.');
            return;
        }

        const { archived } = await archiveDepartedUsers(prisma);
        console.log(`Archived ${archived} user(s) and ended their sessions.`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Failed.');
    process.exitCode = 1;
});
