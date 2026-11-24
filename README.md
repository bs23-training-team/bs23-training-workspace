# BS23 Training Workspace

One workspace for PM-managed training and the trainee learning journey: skill assessment,
learning roadmap, daily sprints, attendance, reports and gamification.

**Stack:** Next.js + TypeScript (web) · NestJS + TypeScript (API) · PostgreSQL (Neon in the cloud,
Docker locally) · Prisma · Redis · pnpm workspaces + Turborepo

## Quick start

Docker Desktop must be running. `fnm use` picks Node 26 from `.nvmrc`; `pnpm setup:local` installs
dependencies, starts Postgres + Redis, applies migrations, generates the Prisma client and adds demo data.

```bash
fnm use
pnpm setup:local
cp -n apps/web/.env.example apps/web/.env.local
pnpm dev
```

Web: http://localhost:3000 · API: http://localhost:4000

First time? Follow the full guide: **[docs/setup.md](docs/setup.md)**.

## Repository layout

```
apps/web      Next.js frontend (src/features/<module> per module)
apps/api      NestJS backend, the only place for business rules (src/modules/<module> per module)
packages/     shared code (contracts, ui)
infra/        local Docker Compose
scripts/      setup and CI helper scripts
docs/         setup guide, architecture decisions, folder guide
```

## Docs

- [Setup guide](docs/setup.md): first-time setup, daily commands, troubleshooting
- [Repository structure](docs/repo-structure.md): what every folder is for and where your code goes
- [Architecture and decisions](docs/architecture.md): how the system is built and why
- [Connecting the web UI to your API module](docs/web-api-integration.md): how each owner replaces the mock with the real API
- [Contributing rules](CONTRIBUTING.md): branches, PRs, migrations, secrets

The PRD and SRS are kept outside this repository; ask E11 for the current version.

> ⚠ This repository is public. Never commit secrets or `.env` files.
