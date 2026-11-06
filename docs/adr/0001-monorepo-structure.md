# ADR 0001: Monorepo Structure, Tooling and Delivery Foundation

| Field | Value |
|---|---|
| Status | **Proposed**: implemented in PR #1–#5, presented at the team kickoff (2026-11-06); awaiting formal approval from E01 / mentor |
| Date | 2026-11-05 (last updated 2026-11-06, see [Changelog](#17-changelog)) |
| Author | E11 (DevOps) |
| Deciders | E01 (architecture owner), E11, all module owners E02–E10, mentor/PM |
| Related | [PRD](../prd.md) and [SRS](../srs.md) v3.2 (UI baseline v19), `BS23_Final_Build_Order_Plan_EN_v19.pdf` |

> **How to review this ADR:** Read sections 3–7. If you disagree with something, comment on the
> PR with the section number. Items marked **⚠ Verify** are assumptions that must be
> checked against current official documentation before or during implementation. They are
> not confirmed facts.

---

## 1. Context

The BS23 Training Workspace is built by 11 people: 10 full-stack developers (E01–E10), each owning
one module end-to-end (UI, API, Prisma changes, tests), and one DevOps engineer (E11).

The SRS already fixes several constraints that this ADR must respect:

- **Stack (confirmed):** Next.js + TypeScript (web), NestJS + TypeScript (API), PostgreSQL on Neon, Prisma ORM.
- **Layout (SRS p.9):** `apps/web` (Next.js), `apps/api` (NestJS with Prisma), shared public contracts and shared UI components.
- **Authority (SRS p.9):** NestJS owns permissions, scores, deadlines, approvals, XP and snapshots. Next.js Server Actions / route handlers may only proxy.
- **One schema (SRS p.8):** one canonical Prisma schema and **one** migration history under the NestJS app.
- **Workers (SRS p.1, p.9):** AI, ERP/Teams sync, PDF and mail run as **durable jobs** with status, timeout, retry and stale-result checks. *In-memory events alone are insufficient.*
- **Outbox (SRS p.8):** domain state and outbox event are committed together; consumers deduplicate.
- **Environments (SRS p.9):** dev / test / staging / production isolated with separate credentials; no production resets or seeds; tests run on real PostgreSQL, **not SQLite**.
- **Neon/Prisma (SRS p.9):** pinned versions and lockfiles; pooled runtime connection, separate direct connection for migrations.
- **CI release gate (SRS p.9):** locked install → lint/types → Prisma validate/generate → clean and upgrade migrations → backend/domain/access/contract/idempotency tests → Next production build → PM/trainee E2E → staging migrations/smoke → controlled release and recovery checks. Any mandatory failure blocks release.
- **Budget:** free tier for now; paid tools may come later if the product goes to production.

The main risk with 10 developers is not the code itself. It is **integration friction**:
inconsistent local setups, conflicting Prisma migrations, broken shared types, and
"works on my machine" problems. This ADR is mainly about reducing that friction from day one.

---

## 2. Decision drivers

1. Ten parallel module owners must be able to work without blocking each other.
2. Shared contracts (DTOs/types) must stay in sync between web and API.
3. A single Prisma schema and migration history (SRS requirement) must not become a merge-conflict bottleneck.
4. CI must enforce the SRS release gate automatically.
5. Free-tier friendly now, but no decision that blocks a paid production setup later.
6. Simple enough for a team learning DevOps practices.

---

## 3. Considered options

### 3.1 Repository strategy

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Monorepo** | One PR can change API + contract + UI together; one CI; shared config; matches SRS layout | Needs workspace tooling; CI must avoid rebuilding everything | ✅ **Chosen** |
| Polyrepo (web / api / packages separate) | Independent deploys | Contract drift, versioning shared packages, 3× CI setup, cross-repo PRs | ❌ |

### 3.2 Monorepo tooling

| Option | Notes | Verdict |
|---|---|---|
| **pnpm workspaces + Turborepo** | Fast installs, strict dependency isolation, task caching, `turbo prune` for Docker builds, low learning curve | ✅ **Chosen** |
| Nx | Very powerful, but more concepts and generators to learn | ❌ (too heavy for this team now) |
| pnpm workspaces only | Simplest, but no task graph/caching; CI rebuilds everything | ❌ |

### 3.3 Background jobs / queue

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Redis + BullMQ** (`@nestjs/bullmq`) | Official NestJS integration; retries, backoff, timeouts, delayed jobs, job status; widely used; Redis is also in the project learning graph | Extra service to host | ✅ **Chosen** |
| pg-boss (Postgres-based queue) | No extra service | Constant polling may keep Neon compute awake (free-tier compute hours) | Fallback |
| In-memory events / setTimeout | Simplest | Explicitly ruled out by SRS | ❌ |

> **⚠ Verify (Phase 3):** Hosted Redis free tiers (e.g. Upstash) may have request/command limits,
> and BullMQ polls Redis frequently. Check current limits before choosing staging hosting. If
> they are insufficient, re-evaluate pg-boss or a small self-hosted Redis.

### 3.4 Worker placement

| Option | Verdict |
|---|---|
| Separate `apps/worker` app | ❌ Duplicates modules, Prisma client and config |
| **Second entrypoint inside `apps/api`** (`main.ts` = HTTP, `worker.ts` = job processors) | ✅ **Chosen**: same code and image, deployed as a separate process |

---

## 4. Decision: repository layout

Exact layout of `develop` on 2026-11-06 (commit `127dd1e`, 111 tracked files). Local-only folders
(`node_modules`, `.next`, `dist`, `.turbo`, `src/generated`, `.env`) are not shown.

```
bs23-training-workspace/
├── .github/
│   ├── workflows/ci.yml              ← CI: runs on every PR
│   ├── CODEOWNERS                    ← who reviews which folder
│   └── pull_request_template.md
│
├── apps/
│   ├── api/                          ← BACKEND (NestJS, port 4000)
│   │   ├── prisma/schema/
│   │   │   ├── base.prisma           ← generator + datasource (E11)
│   │   │   ├── identity.prisma       ← E01 ┐
│   │   │   ├── directory.prisma      ← E02 │
│   │   │   ├── assessment.prisma     ← E03 │
│   │   │   ├── catalog.prisma        ← E04 │
│   │   │   ├── learning.prisma       ← E05 │ empty now,
│   │   │   ├── sprint.prisma         ← E06 │ drafts on Day 2–3,
│   │   │   ├── attendance.prisma     ← E07 │ combined by E10 into one file on Day 4
│   │   │   ├── reports.prisma        ← E08 │
│   │   │   ├── growth-core.prisma    ← E09 │
│   │   │   ├── engagement.prisma     ← E10 ┘
│   │   │   └── README.md
│   │   ├── src/
│   │   │   ├── modules/              ← backend of each module (README only for now)
│   │   │   │   ├── identity/ notifications/ outbox/ dashboard/   ← E01
│   │   │   │   ├── directory/      ← E02     ├── sprint/       ← E06
│   │   │   │   ├── assessment/     ← E03     ├── attendance/   ← E07
│   │   │   │   ├── catalog/        ← E04     ├── reports/      ← E08
│   │   │   │   ├── learning/       ← E05     ├── growth-core/  ← E09
│   │   │   │   └── engagement/     ← E10
│   │   │   ├── config/               ← env validation (E11)
│   │   │   ├── health/               ← /health/live, /health/ready (E11)
│   │   │   ├── prisma/               ← PrismaService (E11)
│   │   │   ├── app.module.ts         ← every module is registered here
│   │   │   ├── main.ts               ← starts the server
│   │   │   └── app.controller.ts, app.service.ts (+ spec)  ← "Hello World" sample
│   │   ├── test/app.e2e-spec.ts
│   │   ├── prisma.config.ts
│   │   ├── .env.example, README.md, AGENTS.md
│   │   └── package.json, tsconfig, vitest, oxlint, nest-cli config
│   │
│   └── web/                          ← FRONTEND (Next.js, port 3000)
│       ├── src/
│       │   ├── app/                  ← routes/pages (create-next-app sample page for now)
│       │   │   └── layout.tsx, page.tsx, globals.css, favicon.ico
│       │   └── features/             ← UI of each module (README only for now)
│       │       ├── shell/ auth/ dashboard/ notifications/   ← E01
│       │       ├── directory/      ← E02     ├── sprint/             ← E06
│       │       ├── assessment/     ← E03     ├── attendance/         ← E07
│       │       ├── catalog/        ← E04     ├── reports/            ← E08
│       │       ├── learning/       ← E05     ├── gamification-core/  ← E09
│       │       └── engagement/     ← E10
│       ├── public/                   ← 5 sample SVGs (E01 replaces them)
│       ├── .env.example, README.md, AGENTS.md
│       └── package.json, next.config.ts, eslint, tsconfig
│
├── packages/
│   ├── contracts/src/health/         ← shared types (only health so far)
│   └── ui/src/index.ts               ← shared components (E10, empty)
│
├── infra/docker-compose.yml          ← local Postgres 18 + Redis 8
│
├── docs/
│   ├── prd.md, srs.md                ← requirements
│   ├── repo-structure.md             ← what every folder is for
│   ├── setup.md                      ← first-time setup
│   ├── week1-team-brief.md
│   ├── adr/0001-monorepo-structure.md
│   └── data-model/_TEMPLATE.md
│
├── CONTRIBUTING.md, README.md
├── package.json, pnpm-workspace.yaml, pnpm-lock.yaml
└── turbo.json, .nvmrc, .gitignore
```

**After Day 4** the ten module `.prisma` files are replaced by one `schema.prisma` (§6.1), and
`apps/api/prisma/migrations/` appears with the first migration.

**Planned, not created yet:** `apps/api/src/worker.ts` (BullMQ worker, §3.4), `apps/api/prisma/seed/`
(50-course seed), `packages/config` (shared lint/tsconfig presets), `e2e/` (Playwright), Dockerfiles
(§11), `docs/runbooks/`, `.github/workflows/deploy-*.yml`. They are added when the phase that needs
them starts, so the repo never contains empty promises.

---

## 5. Module ownership map

The module folders below exist in the repo (each with an owner README). Renaming one is a small PR reviewed by its owner and E11.

| Owner | API module (`apps/api/src/modules/`) | Web feature (`apps/web/src/features/`) | Section in `schema.prisma` |
|---|---|---|---|
| E01 | `identity`, `notifications`, `outbox` (shared event foundation), `dashboard` | `shell`, `auth`, `dashboard`, `notifications` | `E01: identity` |
| E02 | `directory` (trainees, teams, L&D feedback) | `directory` | `E02: directory` |
| E03 | `assessment` (expertise, attempts, evaluation, AI adapter, appeals, recommendations) | `assessment` | `E03: assessment` |
| E04 | `catalog` (courses, versions, assignments, requests) | `catalog` | `E04: catalog` |
| E05 | `learning` (roadmap, topic state, progress) | `learning` | `E05: learning` |
| E06 | `sprint` (tasks, sheets, DS meetings, code quality) | `sprint` | `E06: sprint` |
| E07 | `attendance` (ERP/Teams adapters, sync, leave) | `attendance` | `E07: attendance` |
| E08 | `reports` (drafts, snapshots, PDF, mail) | `reports` | `E08: reports` |
| E09 | `growth-core` (XP ledger, rules, levels, streaks, badges) | `gamification-core` | `E09: growth-core` |
| E10 | `engagement` (quests, leaderboard, hackathon, kudos) | `engagement` + `packages/ui` | `E10: engagement` |
| E11 | `src/health`, `src/config`, `src/prisma` | — | `base.prisma` |
| E11 | Root config, `infra/`, `.github/`, Dockerfiles, `turbo.json`, `docs/runbooks` | | |

**Cross-module rule:** a module calls another module only through that module's exported
NestJS service or through outbox events, never by writing directly to another module's tables.
This matches the SRS ownership boundary (e.g. *E09 alone writes core awards; E10 requests them*).

### CODEOWNERS

The live file is `.github/CODEOWNERS`. Module lines are activated as each member's GitHub username
is mapped to their E number. Schema changes (`apps/api/prisma/`) are reviewed by **E10 + E11**,
shared contracts by **E01 + E11**, shared UI by **E10**.

---

## 6. Database, Prisma and migrations

### 6.1 One schema: per-module drafts, then one combined file

The SRS requires one canonical schema and one migration history. Team decision (kickoff, 2026-11-06):

1. **Day 2–3 (drafts):** on the shared branch `schema/v1`, each owner writes their models in their own
   placeholder file (`identity.prisma` … `engagement.prisma`). No migrations yet, no PR to `develop`.
   Cross-module links are written as plain ID columns with a comment (`traineeId String // → TraineeProfile (E02)`).
2. **Day 4 (combine):** **E10** reviews every draft, removes duplicates, adds the `@relation`s and
   combines everything into **one file, `schema.prisma`**, with one commented section per module.
   The ten draft files are deleted. `base.prisma` (generator + datasource) stays separate.
3. **Day 4 (migrate):** **E11** creates the single initial migration (`pnpm db:migrate --name init`)
   and opens the PR `schema/v1` → `develop`.
4. **After Day 4:** owners change only their own section of `schema.prisma`, with a migration, in small PRs.

Why one file in the end: the team preferred one place to see every relation. The cost is that all
schema PRs touch the same file; editing only your own section keeps git conflicts rare.

Technical basis (verified 2026-11-06): Prisma **7.10.1** reads every `.prisma` file in the folder set in
`prisma.config.ts` (`schema: 'prisma/schema'`) as one schema, so both the ten-file draft stage and the
two-file final stage work without config changes.### 6.2 Migration rules (to avoid conflicts)

1. **One migration per PR**, created with `prisma migrate dev --name <module>_<change>`.
2. Before merging, **rebase on `develop`**. If `develop` received a new migration, delete your migration, regenerate it, and re-test.
3. **Never edit a migration that has been merged** to `develop`.
4. CI applies all migrations to an empty database and fails when the schema has changes that are not in a migration (drift check). *Implemented.* The upgrade test (from the previous release's state) is added once the first release exists.
5. **No destructive changes without a plan**: dropping/renaming columns uses expand → migrate data → contract across separate releases. SRS: *do not cascade-delete historical evidence*.
6. Production migrations run **only** via the deploy pipeline (`prisma migrate deploy`), never from a laptop.

### 6.3 Connections (Neon)

| Variable | Used by | Neon endpoint |
|---|---|---|
| `DATABASE_URL` | Running API + worker | **Pooled** connection string |
| `DIRECT_URL` | Migrations only (CI/deploy) | **Direct** (non-pooled) connection string |

Resolved (Prisma 7): `prisma.config.ts` gives the CLI `DIRECT_URL` (falls back to `DATABASE_URL`),
and the running app passes `DATABASE_URL` to `@prisma/adapter-pg` in `PrismaService`. Locally both
point to the same Docker database.

### 6.4 Seeds

- Seeds (including the 50-course initial catalog) run in **local, test and staging only**.
- Production: no seeds or resets (SRS p.9). The real 50-course content is still an open decision (PRD p.9).

---

## 7. Environments

| Environment | Database | Redis | Deployed from | Purpose |
|---|---|---|---|---|
| **local** | Postgres 18 in Docker Compose (host port **5433**) | Redis 8 in Docker Compose (6379) | developer machine | daily development |
| **ci/test** | Postgres 18 service container (fresh per run) | added when the first Redis feature lands | GitHub Actions | automated tests on real PostgreSQL |
| **staging** | Neon (separate project or branch) | hosted Redis (TBD) | auto-deploy on merge to `develop` | integration, smoke tests, restore/rollback drills |
| **production** | Neon (separate, protected) | hosted Redis (TBD) | merge `develop` → `main` with manual approval | real users |

- The local Postgres **major version must match Neon's**, so behavior is the same. Neon's default for new projects is Postgres 18 (Neon changelog, June 2026), so local uses `postgres:18-alpine`.
- Local Postgres is exposed on host port **5433**, not 5432. Many developers already have a Postgres installed on 5432, and connections to `localhost:5432` would silently reach that one instead of the Docker database.
- Every environment has its **own credentials**. Staging never uses production secrets and the other way round.
- Hosting for web/API/worker is **TBD in Phase 3**. Candidates: Vercel for `web`, and Render / Railway / Fly.io (or similar) for `api` + `worker`.

> **⚠ Verify (Phase 3):** free-tier terms (sleep/idle behavior, hours, limits) of all
> candidate hosts change often. Compare current official pricing pages before choosing.

---

## 8. Secrets and configuration

1. Each app has its own example file (`apps/api/.env.example`, `apps/web/.env.example`) listing **every** variable with a comment and a fake value. Real files (`apps/api/.env`, `apps/web/.env.local`) are git-ignored. Env files are per app because Next.js and NestJS each load env files from their own folder.
1a. **The repository is public** (chosen because branch rulesets are not enforced on private repos on GitHub Free). Every commit is world-readable, so a leaked secret must be revoked, not just deleted.
2. Secrets (DB, AI API key, mail provider, ERP/Teams, SonarQube tokens) live in **GitHub Environments secrets** and in the hosting provider's secret store, never in code.
3. **Never** put a secret in a `NEXT_PUBLIC_*` variable (SRS p.9). Those are shipped to the browser.
4. Config is validated at startup (`apps/api/src/config/env.validation.ts`). The API **refuses to start** if a required variable is missing and names it. *Implemented.*
5. *Planned:* CI runs a secret scanner (e.g. gitleaks) on every PR.
6. Logs must not contain credentials, private answers or leave reasons (SRS p.9).

---

## 9. Git workflow

- **Two long-lived branches:** `develop` (integration, default branch, deploys to staging) and `main` (production, merged from `develop` at release time by E11/E01 only).
- **Short-lived task branches** (1–3 days) off `develop`: `feat/e04-course-requests`, `fix/e07-leave-dates`, `chore/e11-ci-cache`. No long-lived per-member branches: they cause late, painful integration.
- **Branch ruleset on `main` and `develop`:** PR required, 1 approval, **CI check required**, no force-push, no deletion. Repository admins can bypass for PRs only, used only when CI is green and no second reviewer exists yet.
- **Shared draft branch `schema/v1`:** unprotected, used only for the Day 2–4 schema drafts (§6.1), merged into `develop` by one PR and then retired.
- PR authors merge their own approved PRs into `develop`.
- **Squash merge** with Conventional Commit titles (`feat(catalog): add course request API`).
- Full rules for the team: `CONTRIBUTING.md`.
- PR template: what changed, which user story / SRS IDs, migration included (yes/no), screenshots, test evidence.
- Keep PRs small (ideally under ~400 changed lines). Big PRs slow down review for everyone.

---

## 10. CI/CD pipeline (maps to the SRS release gate)

| # | SRS gate step | Implementation | Status |
|---|---|---|---|
| 1 | Locked install | `pnpm install --frozen-lockfile` | ✅ in `ci.yml` |
| 2 | Lint / types | `pnpm lint`, `pnpm typecheck` (Turborepo) | ✅ |
| 3 | Prisma validate / generate | `pnpm db:validate`; generate runs before every task | ✅ |
| 4 | Clean + upgrade migrations | `migrate deploy` on an empty Postgres 18 + `migrate diff --exit-code` drift check | ✅ clean + drift; upgrade test after first release |
| 5 | Backend / domain / access / contract / idempotency tests | Vitest (`pnpm test`); module owners add tests with their modules | ✅ runner; tests grow with modules |
| 6 | Next production build | `pnpm build` | ✅ |
| – | API smoke test (extra) | start built API, wait for `/health/ready` | ✅ |
| 7 | PM / trainee E2E | Playwright against the built stack | Planned (Phase 3–4) |
| 8 | Staging migrations / smoke | deploy to staging → `migrate deploy` → health + smoke tests | Planned (Phase 3) |
| 9 | Controlled release + recovery checks | manual-approval production deploy; rollback + restore drill in staging | Planned (Phase 4–6) |

Extra checks (not in SRS, recommended): secret scanning, dependency audit, SonarQube Cloud
analysis (already in scope for code quality, QUALITY-01).

---

## 11. Docker

- `infra/docker-compose.yml` for local Postgres + Redis. One command: `pnpm infra:up` (also `infra:down`, `infra:logs`). *Implemented.*
- On Windows the team runs Docker Desktop and uses **Git Bash** for all commands (`docs/setup.md`).
- *Planned (Phase 3):* multi-stage Dockerfiles using `turbo prune` so each image contains only what it needs.
- `apps/api` builds **one image** that runs as either `api` (`node dist/main.js`) or `worker` (`node dist/worker.js`).
- Containers run as a non-root user, with health checks.

---

## 12. Version pinning

| Item | How |
|---|---|
| Node.js | **26** (Active LTS since 2026-10-28) via `.nvmrc` + `"engines": ">=26 <27"`. Verified: Next.js and NestJS skeletons build and run on Node 26.13.0. |
| pnpm | `"packageManager": "pnpm@12.16.1"` in root `package.json` |
| Dependencies | exact versions + committed `pnpm-lock.yaml` |
| Prisma | **7.10.1** exact (`prisma`, `@prisma/client`, `@prisma/adapter-pg`). npm's `latest` tag pointed to an 8.0 release candidate on 2026-11-06, so Prisma is never added without a version. |
| Next / NestJS / Postgres | Next.js 16, NestJS 12 (CLI), Postgres 18; upgraded deliberately in dedicated PRs |

> Resolved 2026-11-06: Node 26 chosen (see table). pnpm is installed directly (Homebrew on macOS), not via Corepack.

---

## 13. Observability (later phases)

- Health endpoints: `GET /health/live` (process up) and `GET /health/ready` (database reachable, HTTP 503 when not). *Implemented;* the Redis check is added with the first Redis feature.
- Structured JSON logs with request IDs, with private fields scrubbed.
- Job monitoring: queue depth, failed jobs, retry counts, ERP/Teams sync freshness, mail send status (SRS p.9).
- Error tracking and uptime alerts: tools TBD, free-tier options to be compared in Phase 5.

---

## 14. Consequences

**Positive**
- One `git clone` + one `docker compose up` + one `pnpm dev` gives a working stack for every developer.
- Contract changes are caught in CI before they break another module.
- Schema conflicts are reduced by the draft-then-combine process (§6.1), per-module sections and clear migration rules.
- CI enforces the SRS release gate automatically.

**Negative / costs**
- Everyone must learn basic pnpm/Turborepo commands (covered in `docs/setup.md`).
- The shared migration history still needs discipline (§6.2). E10 + E11 review all schema PRs.
- One combined `schema.prisma` means every schema PR touches the same file; owners must stay inside their own section.
- Redis adds one more service to host and monitor.
- Monorepo CI needs caching to stay fast as the code grows.

---

## 15. Open questions

1. ~~Does the team accept this layout?~~ Presented at the kickoff (2026-11-06). Formal approval by E01 / mentor pending.
2. ~~Who administers the GitHub organization?~~ E11 (`bs23-training-team`). Public repo still to be confirmed with the mentor.
3. ~~Module folder names?~~ Created (§5); renames by small PR.
4. Hosting providers for staging/production (Phase 3, after free-tier verification).
5. Hosted Redis choice and limits (Phase 3).
6. Isolated code runner design for AI-01 (code execution with resource/network limits). Needs its own ADR.
7. File storage for PDFs / profile photos (SRS: open "supporting host/job/file choice").
8. Retention, recovery (RPO/RTO) and load targets. SRS marks them as pending decisions.
9. Cache Components is on in the Next.js scaffold (create-next-app default). E01 to confirm.

---

## 16. Next steps

1. ~~Repo, rules, skeleton, local infra, Prisma, contracts, health checks, CI, docs.~~ Done (PR #1–#5).
2. Every developer follows `docs/setup.md` and confirms the stack runs locally.
3. Day 2–4: schema drafts → E10 combine → E11 initial migration (§6.1).
4. E11: Neon staging, hosting choice and first deploy (Phase 3).
5. Module owners build their modules inside their folders (§5).

---

## 17. Changelog

**2026-11-06: implementation of Week 1 (skeleton + local infra)**

| Area | Decision / finding |
|---|---|
| Node | Node 26 pinned (`.nvmrc`). Verified Next.js and NestJS run on 26.13.0. |
| Web | Next.js 16 (`create-next-app` 16.4.5) with TypeScript, ESLint, Tailwind, App Router, `src/` dir. Cache Components is on (create-next-app default); E01 should confirm this is wanted. |
| API | NestJS (CLI 12) scaffolded as **ESM** with **Vitest** (not CJS/Jest) and oxlint. `@nestjs/observe` was declined; observability is chosen in Phase 5. API dev port **4000** (Next.js uses 3000). |
| pnpm | `create-next-app` generated its own `apps/web/pnpm-workspace.yaml`. Its `allowBuilds` settings were moved to the root file, because pnpm only reads the root one. |
| Local DB | Postgres 18 (matches Neon default) on host port **5433** to avoid clashing with pre-installed Postgres on 5432. Volume persistence verified (data survives `infra:down` / `infra:up`). |
| Env files | Per-app `.env.example` instead of one root file. `apps/web/.gitignore` needed `!.env.example`, because its `.env*` rule was hiding the example file. |
| Git | `develop` + `main` model with short-lived task branches (§9). Repo made public so rulesets are enforced on GitHub Free. |

**2026-11-06 (later): Prisma, CI and the schema process**

| Area | Decision / finding |
|---|---|
| Prisma | 7.10.1 pinned. Schema folder in `prisma.config.ts`; `DIRECT_URL` for the CLI, `DATABASE_URL` via `@prisma/adapter-pg` at runtime. `prisma generate --no-hints` (avoids a 30-second interactive prompt). |
| pnpm | `allowBuilds` allows `prisma` and `@prisma/engines` install scripts; pnpm 12 fails the install when they are blocked. |
| Schema process | Per-module drafts on `schema/v1`, combined by **E10** into one `schema.prisma` on Day 4, initial migration by E11 (§6.1). Changes the earlier plan of keeping ten permanent module files and E01 as schema reviewer. |
| CI | `.github/workflows/ci.yml` implements gate steps 1–6 plus an API smoke test; set as a required check on `main` and `develop`. |
| Packages | `@bs23/contracts` (built ESM types, `health` contract) and `@bs23/ui` (skeleton for E10). |
| Windows | Team machines run Windows: Git Bash + Docker Desktop instead of WSL/Ubuntu (`docs/setup.md`). |
| Docs | PRD/SRS v3.2 added as markdown (`docs/prd.md`, `docs/srs.md`); module folders created with owner READMEs; `docs/repo-structure.md` explains every folder. |
| Layout | §4 now shows the exact repository tree on `develop` (commit `127dd1e`) instead of the target sketch. |
