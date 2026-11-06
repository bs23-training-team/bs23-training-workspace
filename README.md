# BS23 Training Workspace

One workspace for PM-managed training and the trainee learning journey: skill assessment,
learning roadmap, daily sprints, attendance, reports and gamification.

**Stack:** Next.js + TypeScript (web) · NestJS + TypeScript (API) · PostgreSQL (Neon in the cloud,
Docker locally) · Prisma · Redis · pnpm workspaces + Turborepo

## Quick start

```bash
fnm use                  # Node 26 from .nvmrc
pnpm install
pnpm infra:up            # Postgres (port 5433) + Redis in Docker
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm dev                 # web → http://localhost:3000, api → http://localhost:4000
```

First time? Follow the full guide: **[docs/setup.md](docs/setup.md)**.

## Repository layout

```
apps/web      Next.js frontend (src/features/<module> per module)
apps/api      NestJS backend, the only place for business rules (src/modules/<module> per module)
packages/     shared code (contracts, ui, config)
infra/        local Docker Compose
docs/         setup guide, architecture decisions (adr/), runbooks
```

## Docs

- [PRD](docs/prd.md): what we build · [SRS](docs/srs.md): technical rules and acceptance tests
- [Repository structure](docs/repo-structure.md): what every folder is for and where your code goes
- [Setup guide](docs/setup.md)
- [Contributing rules](CONTRIBUTING.md): branches, PRs, migrations, secrets
- [ADR 0001: Monorepo structure](docs/adr/0001-monorepo-structure.md)

> ⚠ This repository is public. Never commit secrets or `.env` files.
