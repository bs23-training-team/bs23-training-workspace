# Repository structure: what every folder is for

One repository holds the whole product (a **monorepo**): the website, the API, shared code, local
infrastructure, scripts and documentation. Why a monorepo and the other decisions:
[architecture.md](architecture.md).

## Where do I put my code?

| I am writing… | Put it in | Owner |
|---|---|---|
| A screen, form or table for my module | `apps/web/src/features/<my-module>/` | me |
| A page/route that shows my feature | `apps/web/src/app/...` (thin, imports my feature; agree the route with E01) | E01 + me |
| An API route | `apps/api/src/modules/<my-module>/<my-module>.controller.ts` | me |
| A business rule | `apps/api/src/modules/<my-module>/<my-module>.service.ts` | me |
| A test for my service | next to it: `<my-module>.service.spec.ts` | me |
| Database tables | my section in `apps/api/prisma/schema/schema.prisma` + one migration | me (reviewed by E11) |
| A type both web and API need | `packages/contracts/src/<my-module>/index.ts` | me (reviewed by E11) |
| A UI building block several modules use | `packages/ui/src/` | E10 |
| Demo data for everyone | `apps/api/prisma/seed/seed.ts` (ask E11) | E11 |
| Docker, CI, scripts, build config | `infra/`, `.github/`, `scripts/`, root files | E11 |

Never edit `apps/api/src/app.module.ts` or `packages/contracts/src/index.ts`: every module is already
registered and re-exported there.

Module folder names and owners:

| Owner | API (`apps/api/src/modules/`) | Web (`apps/web/src/features/`) | Contracts (`packages/contracts/src/`) |
|---|---|---|---|
| E01 | `identity`, `notifications`, `outbox`, `dashboard` | `shell`, `auth`, `dashboard`, `notifications` | `identity`, `notifications`, `outbox`, `dashboard` |
| E02 | `directory` | `directory` | `directory` |
| E03 | `assessment` | `assessment` | `assessment` |
| E04 | `catalog` | `catalog` | `catalog` |
| E05 | `learning` | `learning` | `learning` |
| E06 | `sprint` | `sprint` | `sprint` |
| E07 | `attendance` | `attendance` | `attendance` |
| E08 | `reports` | `reports` | `reports` |
| E09 | `growth-core` | `gamification-core` | `growth-core` |
| E10 | `engagement` | `engagement` (+ `packages/ui`) | `engagement` |

Every API module folder already has an empty `<module>.module.ts` and a README with its
requirements. Every web feature folder has a README.

## The whole tree

```
bs23-training-workspace/
├── apps/                          ← the two runnable applications
│   ├── web/                       ← FRONTEND: Next.js website (port 3000)
│   │   ├── src/app/               ← routes: pages and layouts (App Router)
│   │   ├── src/features/          ← one folder per module's UI
│   │   ├── public/                ← static images and icons
│   │   ├── .env.example           ← web settings to copy into .env.local
│   │   ├── next.config.ts         ← Next.js settings
│   │   ├── eslint.config.mjs      ← lint rules for the web
│   │   ├── AGENTS.md              ← notes for AI coding tools (re-written by `next dev`, leave it)
│   │   └── package.json           ← web dependencies and scripts
│   │
│   └── api/                       ← BACKEND: NestJS API (port 4000), the only place for business rules
│       ├── src/main.ts            ← starts the HTTP server
│       ├── src/app.module.ts      ← root module: every module is already registered here
│       ├── src/modules/           ← one folder per module's backend (13 folders)
│       ├── src/health/            ← /health/live and /health/ready; reference shape for a module (E11)
│       ├── src/config/            ← checks required environment variables at startup (E11)
│       ├── src/prisma/            ← PrismaService: the one database client (E11)
│       ├── src/generated/         ← Prisma client, generated, not in git
│       ├── prisma/schema/
│       │   ├── base.prisma        ← generator + datasource (E11)
│       │   ├── schema.prisma      ← all tables, one section per module
│       │   └── README.md          ← how to change the schema, step by step
│       ├── prisma/migrations/     ← database change history (never edit a merged folder)
│       ├── prisma/seed/seed.ts    ← local demo data, `pnpm db:seed` (E11)
│       ├── prisma.config.ts       ← tells Prisma where the schema is and which URL to use
│       ├── test/                  ← API end-to-end tests
│       ├── .env.example           ← API settings to copy into .env
│       ├── .oxlintrc.json         ← lint rules for the API
│       ├── vitest.config.ts       ← unit tests (*.spec.ts)
│       ├── vitest.config.e2e.ts   ← tests that need the database (*.e2e-spec.ts)
│       ├── AGENTS.md              ← notes for AI coding tools
│       └── package.json           ← API dependencies and scripts
│
├── packages/                      ← code shared by web and API (not run on its own)
│   ├── contracts/                 ← @bs23/contracts: shared TypeScript types, one folder per module
│   └── ui/                        ← @bs23/ui: shared React components (E10)
│
├── infra/
│   └── docker-compose.yml         ← local Postgres 18 (port 5433) + Redis 8 (port 6379)
│
├── scripts/                       ← helper scripts (E11)
│   ├── setup-local.sh             ← `pnpm setup:local`: whole local setup in one command
│   ├── check-migrations.sh        ← the `Migration guard` CI check
│   └── pr-labels.sh               ← picks PR labels from the changed paths
│
├── docs/                          ← documentation
│   ├── architecture.md            ← architecture decisions and why they were made
│   ├── repo-structure.md          ← this file
│   ├── setup.md                   ← first-time setup on Mac / Windows (Git Bash) / Linux
│   └── E01_AUTH_WORKSPACE_INTEGRATION_DELIVERABLES.md ← E01's auth and workspace deliverables
│
├── .github/
│   ├── workflows/ci.yml           ← CI + `Migration guard`: must be green to merge
│   ├── workflows/pr-title.yml     ← `PR title` check: must be green to merge
│   ├── workflows/pr-labels.yml    ← adds labels to PRs (helper, not required)
│   ├── CODEOWNERS                 ← every PR asks E11 for review
│   └── pull_request_template.md   ← checklist shown on every new PR
│
├── CONTRIBUTING.md                ← team rules: branches, PRs, migrations, secrets
├── README.md                      ← project intro and quick start
├── package.json                   ← root scripts: dev, build, lint, test, typecheck, setup:local, db:*, infra:*
├── pnpm-workspace.yaml            ← tells pnpm which folders are packages
├── pnpm-lock.yaml                 ← exact versions of every dependency (commit it, never edit by hand)
├── turbo.json                     ← task order (generate Prisma client → build / lint / test)
├── .nvmrc                         ← Node version (26), read by fnm
└── .gitignore                     ← files git never tracks (.env, node_modules, build output)
```

## Folders you will see locally but never commit

`node_modules/` (downloaded libraries), `.next/` and `dist/` (build output), `.turbo/` (task cache),
`src/generated/` (Prisma client), `.env` and `.env.local` (your real settings). Git ignores all of them.

## Root commands

| Command | What it does |
|---|---|
| `pnpm setup:local` | install, start Docker, apply migrations, generate the client, seed (safe to repeat) |
| `pnpm infra:up` / `pnpm infra:down` / `pnpm infra:logs` | start / stop / watch local Postgres and Redis |
| `pnpm dev` | run web + API with auto-reload |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | the same checks CI runs |
| `pnpm --filter api test:e2e` | API tests that need the local database |
| `pnpm db:validate` | check the Prisma schema |
| `pnpm db:migrate --name <change> --create-only` | create a migration without running it (then read the SQL) |
| `pnpm db:migrate` | apply your new migration locally |
| `pnpm db:deploy` | apply all merged migrations |
| `pnpm db:generate` | regenerate the Prisma client |
| `pnpm db:status` | show whether every migration is applied |
| `pnpm db:seed` | add the demo data |
| `pnpm db:studio` | browse the local database in the browser |
