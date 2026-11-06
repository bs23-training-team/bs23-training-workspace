# apps/api: NestJS backend

The only place for business rules: permissions, scores, deadlines, approvals, XP and snapshots
(SRS p.9). `apps/web` calls this API.

## Run

From the repository root (see [docs/setup.md](../../docs/setup.md) for first-time setup):

```bash
pnpm infra:up      # Postgres + Redis in Docker
pnpm dev           # web on :3000, api on :4000
```

Check it:

- http://localhost:4000/health/live → `{"status":"ok"}` (process is running)
- http://localhost:4000/health/ready → `{"status":"ok","checks":{"database":"up"}}`, or HTTP 503 if the database is down

## Environment

Copy `.env.example` to `.env`. The API refuses to start without `DATABASE_URL` and prints which
variable is missing.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | the running API | On Neon: the **pooled** connection string |
| `DIRECT_URL` | Prisma CLI (migrations) | On Neon: the **direct** (non-pooled) connection string |
| `REDIS_URL` | background jobs (coming later) | |
| `PORT` | HTTP server | default 4000 |

## Database (Prisma 7)

- Schema: one schema split into per-module files in [`prisma/schema/`](prisma/schema/README.md)
- Migrations: `prisma/migrations/` (one shared history)
- Client: generated into `src/generated/prisma` (git-ignored). Regenerated automatically by
  `pnpm dev`, `pnpm build` and `pnpm test`. Run it manually with `pnpm db:generate`.
- In code, inject `PrismaService` (global module) in your service:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
}
```

Root commands: `pnpm db:validate`, `pnpm db:migrate --name <change>`, `pnpm db:status`,
`pnpm db:studio`. Never run migrations against staging or production from your laptop.

### Known messages you can ignore

- During `pnpm install`, Prisma 7.10.1 may print *"Prisma only supports Node.js versions 20.19+,
  22.12+, 24.0+"*. On Node 26 this is only a warning (the install continues), and Prisma's
  package requirement is `>=24.0`. Do not downgrade Node because of it.

### Prisma version

Pinned to **7.10.1** (latest stable). npm's `latest` tag currently points to an 8.0 release
candidate, so **never run `pnpm add prisma` without a version.** Prisma upgrades are done by E11
in a separate PR.

## Code layout

```
src/
  main.ts                 HTTP entry point
  app.module.ts           root module (config, prisma, health, then your module)
  config/                 environment validation
  prisma/                 PrismaService (shared DB client)
  health/                 /health/live and /health/ready (E11)
  modules/<module>/       your module: controller, service, DTOs, tests
  generated/              Prisma client (generated, not committed)
```

Imports between our own files end in `.js` (ESM): `import { X } from './x.js';`

## Tests

```bash
pnpm --filter api test        # unit tests (Vitest)
pnpm --filter api test:watch
```
