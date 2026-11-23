/**
 * Operator command: create the very first PM and its workspace.
 *
 * This is the "secure administrative process" for the initial PM. There is no
 * Admin role or table in the approved schema, and there must be no public
 * endpoint for this, so it is a command that only someone with access to the
 * server and its database credentials can run. It does not start the API.
 *
 *   cd apps/api
 *   PROVISION_WORKSPACE_NAME="BS23 Training" \
 *   PROVISION_PM_NAME="Jane Doe" \
 *   PROVISION_PM_EMAIL=jane@company.com \
 *   pnpm exec tsx src/modules/identity/cli/provision-initial-pm.ts --yes
 *
 * The password is typed at a hidden prompt. For automation it may instead be
 * passed in PROVISION_PM_PASSWORD (it is then visible to anything that can read
 * the process environment, so prefer the prompt). The password is never
 * printed. The command refuses to run once any PM exists, and it prints which
 * database it is about to write to and needs --yes to continue.
 *
 * The PM must change the password at first sign-in.
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../../generated/prisma/client.js';
import { provisionInitialPm } from '../provisioning.js';

function readHidden(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin;

        if (!stdin.isTTY) {
            reject(new Error('No terminal for the password prompt. Set PROVISION_PM_PASSWORD.'));
            return;
        }

        process.stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');

        let value = '';
        const onData = (chunk: string) => {
            for (const char of chunk) {
                if (char === '\r' || char === '\n') {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener('data', onData);
                    process.stdout.write('\n');
                    resolve(value);
                    return;
                }

                if (char === '\u0003') {
                    stdin.setRawMode(false);
                    reject(new Error('Cancelled.'));
                    return;
                }

                if (char === '\u007f' || char === '\b') {
                    value = value.slice(0, -1);
                } else {
                    value += char;
                }
            }
        };

        stdin.on('data', onData);
    });
}

async function main() {
    const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

    if (!connectionString) {
        throw new Error('DATABASE_URL is not set (apps/api/.env).');
    }

    const workspaceName = process.env['PROVISION_WORKSPACE_NAME'] ?? '';
    const pmName = process.env['PROVISION_PM_NAME'] ?? '';
    const email = process.env['PROVISION_PM_EMAIL'] ?? '';

    // Show the target WITHOUT credentials so the operator can see which database.
    const target = new URL(connectionString);
    console.log(`Target database: ${target.hostname}:${target.port || '5432'}${target.pathname}`);

    if (!process.argv.includes('--yes')) {
        console.log('Nothing was changed. Run again with --yes to create the first PM here.');
        return;
    }

    const password =
        process.env['PROVISION_PM_PASSWORD'] ?? (await readHidden('Initial password for the PM: '));

    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

    try {
        const created = await provisionInitialPm(prisma, {
            workspaceName,
            pmName,
            email,
            password,
            pmId: process.env['PROVISION_PM_ID'] || undefined,
        });

        console.log(`Created PM ${created.pmId} in workspace ${created.workspaceId}.`);
        console.log('The PM must change the password at first sign-in.');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Failed.');
    process.exitCode = 1;
});
