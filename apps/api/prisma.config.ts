// Prisma CLI configuration (Prisma 7).
// Prisma does NOT load .env files by itself, so dotenv is imported here.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // A folder: Prisma reads every *.prisma file inside it as ONE schema.
  // Each module owner edits only their own file (see prisma/schema/README.md).
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // CLI commands (migrate, db pull, studio) use the DIRECT (non-pooled) connection.
    // The running app uses DATABASE_URL (pooled on Neon) via the pg adapter instead.
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
