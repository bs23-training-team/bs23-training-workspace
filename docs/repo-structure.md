# Repository structure: what every folder is for

One repository holds the whole product (a **monorepo**): the website, the API, shared code, local
infrastructure and documentation. Why a monorepo: [ADR 0001](adr/0001-monorepo-structure.md).

## Where do I put my code?

| I am writing… | Put it in | Owner |
|---|---|---|
| A screen, form or table for my module | `apps/web/src/features/<my-module>/` | me |
| A page/route that shows my feature | `apps/web/src/app/...` (thin, imports my feature; agree the route with E01) | E01 + me |
| An API route or business rule | `apps/api/src/modules/<my-module>/` | me |
| Database tables | my section in `apps/api/prisma/schema/` | me (reviewed by E10 + E11) |
| A type both web and API need | `packages/contracts/src/<my-module>/` | me (reviewed by E01 + E11) |
| A UI building block several modules use | `packages/ui/src/` | E10 |
| Docker, CI, build config | `infra/`, `.github/`, root files | E11 |

Module folder names and owners:

| Owner | API (`apps/api/src/modules/`) | Web (`apps/web/src/features/`) |
|---|---|---|
| E01 | `identity`, `notifications`, `outbox`, `dashboard` | `shell`, `auth`, `dashboard`, `notifications` |
| E02 | `directory` | `directory` |
| E03 | `assessment` | `assessment` |
| E04 | `catalog` | `catalog` |
| E05 | `learning` | `learning` |
| E06 | `sprint` | `sprint` |
| E07 | `attendance` | `attendance` |
| E08 | `reports` | `reports` |
| E09 | `growth-core` | `gamification-core` |
| E10 | `engagement` | `engagement` (+ `packages/ui`) |

Each module folder has a README with its requirements and a suggested file layout.

## The whole tree

```
bs23-training-workspace/
├── apps/                         ← the two runnable applications
│   ├── web/                      ← FRONTEND: Next.js website (port 3000)
│   │   ├── src/app/              ← routes: pages and layouts (App Router)
│   │   ├── src/features/         ← one folder per module's UI
│   │   ├── public/               ← static images and icons
│   │   ├── .env.example          ← web settings to copy into .env.local
│   │   ├── next.config.ts        ← Next.js settings
│   │   ├── eslint.config.mjs     ← lint rules for the web
│   │   ├── AGENTS.md             ← notes for AI coding tools (re-written by `next dev`, leave it)
│   │   └── package.json          ← web dependencies and scripts
│   │
│   └── api/                      ← BACKEND: NestJS API (port 4000), the only place for business rules
│       ├── src/main.ts           ← starts the HTTP server
│       ├── src/app.module.ts     ← root module: every module is registered here
│       ├── src/modules/          ← one folder per module's backend
│       ├── src/config/           ← checks required environment variables at startup (E11)
│       ├── src/prisma/           ← PrismaService: the one database client (E11)
│       ├── src/health/           ← /health/live and /health/ready (E11)
│       ├── src/generated/        ← Prisma client, generated, not in git
│       ├── prisma/schema/        ← database design (one schema, see its README)
│       ├── prisma/migrations/    ← database change history (created on Day 4)
│       ├── prisma.config.ts      ← tells Prisma where the schema is and which URL to use
│       ├── test/                 ← API end-to-end tests
│       ├── .env.example          ← API settings to copy into .env
│       ├── .oxlintrc.json        ← lint rules for the API
│       ├── vitest.config*.ts     ← test runner settings
│       └── package.json          ← API dependencies and scripts
│
├── packages/                     ← code shared by web and API (not run on its own)
│   ├── contracts/                ← @bs23/contracts: shared TypeScript types
│   └── ui/                       ← @bs23/ui: shared React components (E10)
│
├── infra/
│   └── docker-compose.yml        ← local Postgres 18 (port 5433) + Redis 8 (`pnpm infra:up`)
│
├── docs/                         ← documentation
│   ├── prd.md                    ← product requirements (what we build)
│   ├── srs.md                    ← technical requirements and acceptance tests
│   ├── setup.md                  ← first-time setup on Mac / Windows (Git Bash) / Linux
│   ├── week1-team-brief.md       ← first-week tasks and the schema process
│   ├── repo-structure.md         ← this file
│   ├── adr/                      ← architecture decisions and why they were made
│   └── data-model/               ← optional notes template for a module's data model
│
├── .github/
│   ├── workflows/ci.yml          ← CI: runs on every PR, must be green to merge
│   ├── CODEOWNERS                ← who reviews which folder
│   └── pull_request_template.md  ← checklist shown on every new PR
│
├── CONTRIBUTING.md               ← team rules: branches, PRs, migrations, secrets
├── README.md                     ← project intro and quick start
├── package.json                  ← root scripts: dev, build, lint, test, typecheck, db:*, infra:*
├── pnpm-workspace.yaml           ← tells pnpm which folders are packages
├── pnpm-lock.yaml                ← exact versions of every dependency (commit it, never edit by hand)
├── turbo.json                    ← tells Turborepo the order of tasks (generate → build → test)
├── .nvmrc                        ← Node version (26), read by fnm
└── .gitignore                    ← files git never tracks (.env, node_modules, build output)
```

## Folders you will see locally but never commit

`node_modules/` (downloaded libraries), `.next/` and `dist/` (build output), `.turbo/` (task cache),
`src/generated/` (Prisma client), `.env` and `.env.local` (your real settings). Git ignores all of them.

## Root commands

| Command | What it does |
|---|---|
| `pnpm install` | download dependencies (after every pull that changed `pnpm-lock.yaml`) |
| `pnpm infra:up` / `pnpm infra:down` | start / stop local Postgres and Redis |
| `pnpm dev` | run web + API with auto-reload |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | the same checks CI runs |
| `pnpm db:validate` | check the Prisma schema |
| `pnpm db:migrate --name <change>` | create and apply a migration locally |
| `pnpm db:studio` | browse the local database in the browser |
