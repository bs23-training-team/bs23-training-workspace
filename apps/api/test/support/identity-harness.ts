/**
 * Shared set-up for the E01 identity specs: the real IdentityService, the real
 * JwtService / ConfigService, an in-memory database that follows the final v1
 * schema (identity-fake-prisma.ts) and a recording mail transport.
 *
 * Only the database and the mail transport are fake. Hashing, JWT signing and
 * all auth rules are the real code.
 */

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { PrismaService } from '../../src/prisma/prisma.service.js';
import { AccountProvisioningService } from '../../src/modules/identity/account-provisioning.service.js';
import { IdentityService } from '../../src/modules/identity/identity.service.js';
import type { MailService } from '../../src/modules/identity/mail.service.js';
import { FakePrisma } from './identity-fake-prisma.js';

export const PASSWORD = 'Passw0rd!x1';
export const NEW_PASSWORD = 'N3wPassw0rd!y2';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function makeHarness(env: Record<string, string> = {}) {
    const db = new FakePrisma();
    const jwt = new JwtService();
    const config = new ConfigService({
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'r'.repeat(40),
        WEB_APP_URL: 'http://localhost:3000',
        ...env,
    });
    const mail = {
        send: vi.fn(async (_message: { to: string; subject: string; text: string }) => ({
            delivered: false,
            transport: 'console' as const,
        })),
    };
    const service = new IdentityService(
        db as unknown as PrismaService,
        jwt,
        config,
        mail as unknown as MailService,
    );
    const provisioning = new AccountProvisioningService(
        db as unknown as PrismaService,
        config,
        mail as unknown as MailService,
    );
    const passwordHash = await service.hashPassword(PASSWORD);

    return { db, jwt, config, mail, service, provisioning, passwordHash };
}

export type Harness = Awaited<ReturnType<typeof makeHarness>>;

/** A PM and a user in one workspace, both with PASSWORD. */
export async function seedAccounts(harness: Harness) {
    const { db, passwordHash } = harness;
    const workspace = db.addWorkspace();
    const pm = db.addPm(passwordHash, { workspaceId: workspace.id });
    const user = db.addUser(passwordHash, { workspaceId: workspace.id });

    return { workspace, pm, user };
}

export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS);

/** Decodes a JWT payload without checking it (for assertions only). */
export function decodePayload(token: string): Record<string, unknown> {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/** Reads the link token out of the body of a mail the service "sent". */
export function tokenFromMail(text: string): string {
    const match = /token=([0-9a-f]{64})/.exec(text);

    if (!match) {
        throw new Error('no token in mail text');
    }

    return match[1];
}
