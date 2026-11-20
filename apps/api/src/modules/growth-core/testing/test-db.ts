import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service.js';

/**
 * A real PrismaService for the *.e2e-spec.ts tests that need Postgres.
 * Run them with `pnpm --filter api test:e2e` after `pnpm infra:up`, `pnpm db:deploy` and
 * `pnpm db:seed`. They are NOT part of `pnpm test`, because CI runs that before the database
 * has any tables.
 *
 * Safety: refuses to run unless DATABASE_URL points at this machine, so a wrong .env can
 * never make a test write to a shared database.
 */
export function createTestPrisma(): PrismaService {
  const envFile = resolve(process.cwd(), '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.');
  }
  const host = new URL(url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to run tests against a non-local database (${host}).`);
  }
  const config = { getOrThrow: () => url } as unknown as ConfigService;
  return new PrismaService(config);
}

/** The seeded workspace and demo users (pnpm db:seed). Tests build their own rows on top. */
export async function loadSeed(prisma: PrismaService): Promise<{
  workspaceId: string;
  users: string[];
}> {
  const workspace = await prisma.workspace.findUnique({ where: { slug: 'bs23' } });
  if (!workspace) {
    throw new Error('Seed data missing. Run pnpm db:seed.');
  }
  const users = await prisma.user.findMany({
    where: { workspaceId: workspace.id, archivedAt: null },
    orderBy: { userId: 'asc' },
    select: { userId: true },
  });
  if (users.length < 2) {
    throw new Error('Expected at least 2 seeded users. Run pnpm db:seed.');
  }
  return { workspaceId: workspace.id, users: users.map((u) => u.userId) };
}
