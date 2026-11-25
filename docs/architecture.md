# Architecture and Decisions

| Field | Value |
|---|---|
| Owner | E11 (DevOps, architecture owner) |
| Last updated | 2026-11-23 |
| Replaces | ADR 0001 (monorepo structure), ADR 0002 (module layering), ADR 0003 (login IDs as primary keys) |
| Status | §2–§9 implemented. ADR 0001's parts were presented at the kickoff (2026-11-06); ADR 0002 and 0003 were accepted (2026-11-20 and 2026-11-19). |

This is the one place for the project's architecture decisions and the reasons behind them.
To change a decision, open a PR that edits this file and adds a line to the [changelog](#12-changelog).
Folder-by-folder layout: [repo-structure.md](repo-structure.md). Machine setup: [setup.md](setup.md).
Day-to-day team rules: [CONTRIBUTING.md](../CONTRIBUTING.md).

The PRD and SRS are no longer stored in this repository (removed 2026-11-23). References below such
as "SRS" or user-story IDs (US13, COURSE-02) point to those documents; ask E11 for the current version.

## Decisions at a glance

| # | Decision | Section |
|---|---|---|
| 1 | One monorepo with pnpm workspaces + Turborepo | §2 |
| 2 | Each of E01–E10 owns one module end to end; modules talk only through exported services or outbox events | §3 |
| 3 | Inside a module: thin controller → service with the rules → Prisma; web has no business rules | §3 |
| 4 | Login IDs (`PM002`, `BS23001`) are primary keys and never change or get reused | §4 |
| 5 | One `schema.prisma`, one migration history, at most one new migration per PR, no cascade deletes | §5 |
| 6 | Seeds only in local / test / staging, never production | §5 |
| 7 | Separate environments with separate credentials; secrets never in the repo | §6 |
| 8 | Short task branches off `develop`, squash merge, E11 is the only reviewer, 3 required CI checks | §7 |
| 9 | Exact version pinning (Node 26, pnpm 12.16.1, Prisma 7.10.1) | §9 |

---

## 1. Context

The BS23 Training Workspace is built by 11 people: 10 full-stack developers (E01–E10), each owning
one module end to end (UI, API, schema section, tests), and one DevOps engineer (E11).

Constraints from the SRS that these decisions respect:

- **Stack:** Next.js + TypeScript (web), NestJS + TypeScript (API), PostgreSQL on Neon, Prisma ORM.
- **Authority:** NestJS owns permissions, scores, deadlines, approvals, XP and snapshots. Next.js
  Server Actions / route handlers may only proxy.
- **One schema:** one canonical Prisma schema and one migration history under the NestJS app.
- **Workers:** AI, ERP/Teams sync, PDF and mail run as durable jobs with status, timeout, retry and
  stale-result checks. In-memory events alone are not enough.
- **Outbox:** domain state and its outbox event are committed together; consumers deduplicate.
- **Environments:** dev / test / staging / production are isolated with separate credentials; no
  production resets or seeds; tests run on real PostgreSQL, not SQLite.
- **Neon + Prisma:** pinned versions and lockfiles; pooled connection at runtime, direct connection
  for migrations.
- **Release gate:** locked install → lint/types → Prisma validate/generate → clean and upgrade
  migrations → tests → production build → E2E → staging migrations/smoke → controlled release.
  Any mandatory failure blocks the release.
- **Budget:** free tier for now; paid tools may come later if the product goes to production.

The main risk with ten developers is integration friction, not the code itself: different local
setups, conflicting migrations, broken shared types and "works on my machine" problems. Most
decisions below exist to reduce that friction.

---

## 2. Repository and tooling

### 2.1 Monorepo

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Monorepo** | One PR can change API + contract + UI together; one CI; shared config | Needs workspace tooling; CI must avoid rebuilding everything | **Chosen** |
| Polyrepo (web / api / packages separate) | Independent deploys | Contract drift, versioned shared packages, 3× CI, cross-repo PRs | Rejected |

### 2.2 Workspace tooling

| Option | Verdict |
|---|---|
| **pnpm workspaces + Turborepo**: fast installs, strict dependency isolation, task caching, `turbo prune` for Docker builds, low learning curve | **Chosen** |
| Nx: powerful, but more concepts to learn | Rejected (too heavy for this team now) |
| pnpm workspaces only: no task graph or caching | Rejected |

Turborepo runs `db:generate` (Prisma client) before every `build`, `typecheck`, `lint`, `test` and
`dev` task (`turbo.json`).

### 2.3 Background jobs (planned)

| Option | Verdict |
|---|---|
| **Redis + BullMQ** (`@nestjs/bullmq`): retries, backoff, timeouts, delayed jobs, job status | **Chosen** |
| pg-boss (Postgres queue): no extra service, but constant polling may keep Neon compute awake | Fallback |
| In-memory events / `setTimeout` | Ruled out by the SRS |

Workers run as a **second entrypoint inside `apps/api`** (`main.ts` = HTTP, `worker.ts` = job
processors): same code and image, deployed as a separate process. A separate `apps/worker` app was
rejected because it would duplicate modules, the Prisma client and config.

> To verify before Phase 3: hosted Redis free tiers (e.g. Upstash) may limit requests, and BullMQ
> polls Redis often. If the limits are too low, re-evaluate pg-boss or a small self-hosted Redis.

---

## 3. Modules: ownership and layering

### 3.1 Ownership

| Owner | API module (`apps/api/src/modules/`) | Web feature (`apps/web/src/features/`) | Section in `schema.prisma` |
|---|---|---|---|
| E01 | `identity`, `notifications`, `outbox`, `dashboard` | `shell`, `auth`, `dashboard`, `notifications` | `E01: identity` |
| E02 | `directory` (trainees, teams, L&D feedback) | `directory` | `E02: directory` |
| E03 | `assessment` (expertise, attempts, evaluation, AI adapter) | `assessment` | `E03: assessment` |
| E04 | `catalog` (courses, assignments, requests) | `catalog` | `E04: catalog` |
| E05 | `learning` (roadmap, topic state, progress) | `learning` | `E05: learning` |
| E06 | `sprint` (tasks, sheets, DS meetings) | `sprint` | `E06: sprint` |
| E07 | `attendance` (ERP/Teams adapters, sync, leave) | `attendance` | `E07: attendance` |
| E08 | `reports` (versions, PDF, mail) | `reports` | `E08: reports` |
| E09 | `growth-core` (XP ledger, rules, levels, streaks, badges) | `gamification-core` | `E09: growth-core` |
| E10 | `engagement` (quests, leaderboard, kudos) | `engagement` + `packages/ui` | `E10: engagement` |
| E11 | `src/health`, `src/config`, `src/prisma` | — | `base.prisma`, migrations, seed |
| E11 | Root config, `infra/`, `.github/`, `scripts/`, Dockerfiles, `turbo.json`, `docs/` | | |

Every feature module already has an empty `<m>.module.ts`, registered in `src/app.module.ts`, and an
empty `packages/contracts/src/<m>/index.ts`, re-exported from `src/index.ts`. Owners add their code
to those files and never edit `app.module.ts` or the contracts `index.ts`. Renaming a module folder is
a small PR reviewed by its owner and E11.

### 3.2 Layering (MVC on NestJS + Next.js)

No top-level `models/`, `views/` or `controllers/` folders. The layers map onto the existing folders:

| Layer | Where it lives | Responsibility |
|---|---|---|
| Model | `apps/api/prisma/schema/schema.prisma`, `PrismaService`, optional `<m>.repository.ts` | Data shape and data access |
| Controller | `apps/api/src/modules/<m>/<m>.controller.ts` | HTTP in and out only |
| Business logic | `apps/api/src/modules/<m>/<m>.service.ts` | The rules of the module |
| View | `apps/web/src/features/<f>/` and `apps/web/src/app/` | What the user sees |
| Contract | `packages/contracts/src/<m>/` | Types shared by API and web |

```
web view ──HTTP──▶ controller ──▶ service ──▶ repository / PrismaService ──▶ database
                       │             │
                       └─ contracts ─┘   (types only, no logic)
```

### 3.3 Rules

1. **Controllers are thin.** Validate input, call one service method, return the result. No business
   rules, no Prisma. (Importing a generated Prisma *enum type* for a parameter is fine.)
2. **Services own the rules.** A service does not use `req`/`res`. It returns data or throws a domain
   error; the controller turns that into an HTTP response.
3. **Prisma stays below the controller.** `PrismaService` is injected only in services or
   repositories, never in controllers, never in `apps/web`.
4. **The web has no business rules.** `apps/web` shows data and sends user actions to the API.
5. **Modules talk through exports.** To use another module, import its NestJS module and call its
   exported service, or emit an outbox event. Reading another module's tables is allowed; writing to
   them is not (for example, only growth-core writes XP and awards; engagement asks growth-core).
6. **Shared shapes go to `packages/contracts`.** A type both web and API need lives in
   `packages/contracts/src/<m>/`.
7. **Identity comes only from `req.user`.** The auth guard (E01) sets `req.user`; a module reads who
   the caller is and which workspace they belong to from it and from nothing else. No `req.user`
   means `401`. Never read identity from headers, query, or body (for example `x-actor-pm-id`,
   `x-workspace-id`): anyone can send those. Tests build `req.user` directly (unit tests) or use
   the test auth helper once E01 provides it. Until login exists, web pages use mock data and send
   no identity headers.

   **Shape of `req.user`** (set by E01's `JwtAuthGuard`, read-only):

   | Field | Meaning |
   |---|---|
   | `sub` | The login ID: `Pm.pmId` for a PM, `User.userId` for a user (for example `PM001`, `BS23001`). Not a UUID. |
   | `sid` | `Session.id` of the current session. |
   | `workspaceId` | The account's workspace, read from the database (not from the token). |
   | `role` | `'PM'` or `'TRAINEE'` (see §4.2). |

   Protect a route with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('PM')` or
   `@Roles('TRAINEE')`; import `IdentityModule`. Do not define your own copy of this type or read
   `pmId` / `userId` from `req.user`: use `sub` and `role`. Every query must still filter on
   `req.user.workspaceId`.

### 3.4 Layout of one module

```
apps/api/src/modules/<m>/
├── <m>.module.ts
├── <m>.controller.ts
├── <m>.service.ts
├── <m>.repository.ts      # optional: only when queries get long or reused
├── <m>.service.spec.ts    # unit tests next to the service; mock PrismaService and other modules' services
└── dto/                   # request classes; shared response types go to contracts

apps/web/src/features/<f>/
├── components/            # UI
├── hooks/                 # data fetching and UI state
├── api.ts                 # the only place that calls the API
└── types.ts               # re-export types from @bs23/contracts
```

Create files only when needed. **Reference implementation:** `apps/api/src/health/` (thin
controller, service with the check, a spec for each). Copy its shape when starting a module.

### 3.5 Enforcement

- Code review by E11 checks the rules above on every PR.
- Planned: an oxlint rule so `*.controller.ts` cannot import `PrismaService`, and an import check that
  `apps/web` never imports from `apps/api`. Until then the rules rely on review.

---

## 4. Data model rules

### 4.1 Login IDs are primary keys

There are two separate login tables and no role enum: which table a person is in decides their role.

- `Pm` for PMs (admins), primary key `pmId`, e.g. `PM002`
- `User` for the 4 resource types (TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT, SBU), primary key
  `userId`, e.g. `BS23001`

These IDs are foreign keys in more than 30 tables. The usual alternative (a hidden uuid key plus a
unique code column) would make an ID change cheap, but we chose readable keys and simple joins.
That is only safe if the application keeps these rules:

1. **An ID never changes.** No API, screen or script updates `Pm.pmId` or `User.userId`. A typo is
   fixed by creating a new record.
2. **An ID is never reused.** A user who leaves keeps their row (`archivedAt` is set).
3. **An ID is unique across the whole system**, not only inside one workspace.
4. **The format is fixed for v1:** PMs `PM` + number, users `BS23` + number. A new format needs a
   change to this document.
5. **One email belongs to one person.** The same email cannot be in both `Pm` and `User` (triggers
   `trg_pm_email` and `trg_user_email` in the `init` migration).

| Owner | Action |
|---|---|
| E01 (identity) | Login looks up `Pm` by `pmId` and `User` by `userId` (or by email in both tables). No ID-change endpoint. |
| E02 (directory) | Creating a user takes the next free ID and never reuses an archived one. Editing never touches `userId`. |
| E11 (reviewer) | Rejects any PR that updates `pmId` / `userId` or adds an ID-change path. |

Cost: if an ID ever had to change, it would be a migration touching 30+ tables. The database cannot
stop ID reuse (rule 2); only code review can.

### 4.2 Other v1 schema decisions (2026-11-19)

- No `CourseVersion` table. A topic (`CourseModule`) belongs directly to a `Course`.
- No `TECHNICAL` badge kind. `BadgeAward.attemptId`, `projectUrl` and `projectReviewed` stay in the
  table, unused, for a later version.
- Two different things are both called `TRAINEE`: `User.resource = TRAINEE` is one of the 4 resource types, while the login role `TRAINEE` (in `req.user.role`) means any `User` account, whatever its resource type. A PM has the login role `PM`. There is no role column: the role is the table the account was found in.
- Every relation uses `onDelete: Restrict`. History is kept with `archivedAt` / status columns
  instead of deleting rows.
- Rules Prisma cannot express are hand-written SQL at the end of the migration that introduces them
  (the `init` migration has 23 CHECK constraints, 2 partial unique indexes and 2 email triggers).
  They are marked `// DB:` in `schema.prisma`.

---

## 5. Database, migrations and seeds

### 5.1 One schema

All models are in **one file**, `apps/api/prisma/schema/schema.prisma`, with one commented section per
module. `base.prisma` (generator + datasource) is separate and owned by E11. Prisma 7.10.1 reads every
`.prisma` file in the folder set in `prisma.config.ts`, so no other `.prisma` file may be added.
Owners edit only their own section. Step-by-step guide: `apps/api/prisma/schema/README.md`.

History: module owners drafted their models in separate files on a shared `schema/v1` branch; E11
combined them into one file and created the `init` migration (PR #12, 2026-11-19). The `schema/v1`
branch is retired.

### 5.2 Migration rules

1. **At most one new migration per PR.** Create it with
   `pnpm db:migrate --name <reason> --create-only`, read the generated SQL, then apply it.
2. **Never edit or delete a migration that is merged** to `develop`. Other databases have already run it.
3. **If `develop` gets a new migration before yours merges:** rebase, delete your own unmerged
   migration folder, generate it again, re-test.
4. **No cascade deletes.** `ON DELETE CASCADE` would delete historical evidence (SRS).
5. **No destructive change without a plan.** Dropping or renaming a column goes expand → copy data →
   contract, across separate releases, agreed with E11 first.
6. **Production migrations run only through the deploy pipeline** (`prisma migrate deploy`), never
   from a laptop.

Enforced automatically on every PR:

| Check | What it blocks |
|---|---|
| `Migration guard` (`scripts/check-migrations.sh`) | Changed or deleted merged migrations; more than one new migration folder; `ON DELETE CASCADE`; implicit join tables (`CREATE TABLE "_…"`). `DROP TABLE` / `DROP COLUMN` only warn. |
| CI step "Migrations apply cleanly to an empty database" | A migration that fails on an empty Postgres 18 |
| CI step "Schema and migrations are in sync" | A schema change without a migration (drift) |
| CI step "Seed runs on the migrated database" | A schema change that breaks the seed |

The upgrade test (from the previous release's database) is added once the first release exists.

### 5.3 Connections

| Variable | Used by | Neon endpoint |
|---|---|---|
| `DATABASE_URL` | Running API + worker (via `@prisma/adapter-pg` in `PrismaService`) | Pooled |
| `DIRECT_URL` | Prisma CLI: migrations (falls back to `DATABASE_URL`) | Direct (non-pooled) |

Locally both point to the same Docker database on port 5433.

### 5.4 Seeds

- `apps/api/prisma/seed/seed.ts` (`pnpm db:seed`) creates the demo workspace `bs23`, PMs `PM001` and
  `PM002`, users `BS23001`–`BS23004` (one per resource type), a team, skills, an `XpRule` and two levels.
  All demo passwords are `Password123!` on a local database. On any database that is not on this
  machine the seed refuses to run unless `SEED_PASSWORD` is set to a strong value (the default is
  public because this repository is public).
- Seeds run in **local, test and staging only**. The script refuses to run when
  `NODE_ENV=production`. Production gets no seeds and no resets.
- Running the seed twice is safe; it does not create duplicates.
- The seed file is owned by E11. Module owners create extra test data inside their own tests.
- Courses are not seeded yet: the real 50-course catalog is still an open decision.

---

## 6. Environments, secrets and configuration

| Environment | Database | Redis | Deployed from | Purpose |
|---|---|---|---|---|
| **local** | Postgres 18 in Docker Compose (host port **5433**) | Redis 8 in Docker Compose (6379) | developer machine | daily development |
| **ci/test** | Postgres 18 service container, fresh per run | added with the first Redis feature | GitHub Actions | automated checks on real PostgreSQL |
| **staging** | Neon (separate project or branch) | hosted Redis (TBD) | auto-deploy on merge to `develop` (planned) | integration, smoke tests, restore drills |
| **production** | Neon (separate, protected) | hosted Redis (TBD) | `develop` → `main` with manual approval (planned) | real users |

- Local Postgres uses the same major version as Neon's default (18), so behavior matches.
- Local Postgres is on host port **5433**, not 5432, so it never collides with a Postgres already
  installed on a developer's machine.
- Every environment has its **own credentials**.
- Hosting for web / API / worker is decided in Phase 3. Candidates: Vercel for `web`; Render, Railway or
  Fly.io for `api` + `worker`. Free-tier terms change often and must be checked before choosing.

Secrets:

1. Each app has its own example file (`apps/api/.env.example`, `apps/web/.env.example`) with every
   variable and a fake value. Real files (`apps/api/.env`, `apps/web/.env.local`) are git-ignored.
2. **The repository is public** (branch rulesets are only enforced on public repos on GitHub Free).
   A leaked secret must be revoked, not just deleted from the file.
3. Real secrets live in GitHub Environment secrets and the hosting provider's secret store.
4. Never put a secret in a `NEXT_PUBLIC_*` variable; those are shipped to the browser.
5. The API validates its config at startup (`apps/api/src/config/env.validation.ts`) and refuses to
   start, naming the missing variable.
6. Logs never contain credentials, private answers or leave reasons.
7. Planned: a secret scanner (e.g. gitleaks) in CI.

### 6.1 Before the first staging deploy

Checklist (every item must be done or consciously decided; some items need E01's auth on `develop`):

1. **Seed:** a strong `SEED_PASSWORD` (the seed enforces this on non-local databases).
2. **Dev tokens:** `IDENTITY_EXPOSE_DEV_TOKENS` is unset or `false`. It returns the password-reset
   token in API responses (email verification no longer exists), and it is ignored only when `NODE_ENV=production`.
3. **JWT secrets:** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are two different random values of at
   least 32 characters, kept in the host's secret store, never in the repository.
4. **Mail:** `MAIL_PROVIDER=console` is refused in production; a real provider (and sender address)
   must be chosen before any email can be delivered.
5. **Tokens in the browser:** the web app keeps tokens in `httpOnly`, `Secure`, `SameSite` cookies,
   never in `localStorage` (the decision and the Next.js proxy are still open).
6. **Rate limits:** set `trust proxy` for the chosen host and use a shared store (for example Redis)
   when more than one API instance runs; the counters are in memory today.
7. **Mock data:** the reports web feature uses mock data only when an explicit flag is set, never by
   default.

---

## 7. Git workflow, review and CI

### 7.1 Branches and PRs

- **Two long-lived branches:** `develop` (integration, default branch) and `main` (production,
  merged from `develop` at release time by E11).
- **Short-lived task branches** (1–3 days) off `develop`, named `<type>/e<NN>-<task>`, e.g.
  `feat/e04-course-request-api`. Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`.
- **Rehearsal branches** `rehearsal/e<NN>-<task>` are local only and never pushed. Owners try work
  there first (with an AI agent, the seed data and tests), then copy only their own files to a fresh
  task branch for the PR. The step-by-step flow is in the team beginner guide shared by E11.
- **PR title** follows Conventional Commits: `type(scope): description` (lowercase type, optional
  lowercase scope). It becomes the squash commit message.
- **Squash merge** only. Remote branches are deleted automatically after merge; locally use
  `git branch -D` (squash merges are not detected by `-d`).
- Keep PRs small (ideally under ~400 changed lines). Fill in the PR template.

### 7.2 Review and merge

- **E11 is the only reviewer** for every PR (decided 2026-11-16). `.github/CODEOWNERS` has active rules
  for E11 only; module owners are kept there as a commented ownership map.
- The PR author merges after E11's approval and green required checks.
- Ruleset `protect-main-develop` on `main` and `develop`: PR required, 1 approval, required checks,
  no force push, no deletion. Admins can bypass; a bypass skips both approval and CI, so an admin
  merges only after checking that every job in the Actions tab is green.

### 7.3 Required checks

| Check | Workflow | Required |
|---|---|---|
| `Lint, typecheck, test, migrations, build` | `.github/workflows/ci.yml` | Yes |
| `Migration guard` | `.github/workflows/ci.yml` (PRs only) | Yes |
| `PR title` | `.github/workflows/pr-title.yml` | Yes |
| `Label PR` | `.github/workflows/pr-labels.yml`: adds `mod:<module>`, `schema`, `migration`, `seed`, `infra`, `docs`, `deps` labels from the changed paths | No (helper only) |

### 7.4 CI pipeline against the SRS release gate

| # | Gate step | Implementation | Status |
|---|---|---|---|
| 1 | Locked install | `pnpm install --frozen-lockfile` | Done |
| 2 | Lint / types | `pnpm lint`, `pnpm typecheck` | Done |
| 3 | Prisma validate / generate | `pnpm db:validate`; generate runs before every task | Done |
| 4 | Clean + upgrade migrations | `migrate deploy` on empty Postgres 18, seed, drift check | Clean + drift done; upgrade test after first release |
| 5 | Backend / domain / access / contract / idempotency tests | Vitest unit tests (`pnpm test`); DB-backed `*.e2e-spec.ts` tests (`pnpm --filter api test:e2e`) on the migrated and seeded CI database | Runner done; tests grow with modules |
| 6 | Production build | `pnpm build` | Done |
| – | API smoke test | Start the built API, wait for `/health/ready` | Done |
| 7 | PM / trainee E2E | Playwright against the built stack | Planned (Phase 3–4) |
| 8 | Staging migrations / smoke | Deploy to staging → `migrate deploy` → health + smoke | Planned (Phase 3) |
| 9 | Controlled release + recovery checks | Manual-approval production deploy; rollback + restore drill | Planned (Phase 4–6) |

Recommended extras (not in the SRS): secret scanning, dependency audit, SonarQube Cloud analysis.

---

## 8. Local development and Docker

- `pnpm setup:local` (`scripts/setup-local.sh`) does the whole local setup: locked install, creates
  `apps/api/.env` from the example if missing, starts Postgres + Redis, applies migrations, generates
  the Prisma client and seeds. It is safe to run again after every `git pull`. Details: [setup.md](setup.md).
- `infra/docker-compose.yml` runs Postgres 18 and Redis 8 (`pnpm infra:up`, `infra:down`, `infra:logs`).
- Ports: web 3000, API 4000, Postgres 5433, Redis 6379.
- Team machines: E11 uses macOS; everyone else uses Windows with Docker Desktop and **Git Bash** (no WSL).
- Planned (Phase 3): multi-stage Dockerfiles using `turbo prune`. `apps/api` builds one image that runs
  as `api` (`node dist/main.js`) or `worker` (`node dist/worker.js`), as a non-root user with health checks.

---

## 9. Version pinning

| Item | How |
|---|---|
| Node.js | **26** via `.nvmrc` + `"engines": ">=26 <27"` |
| pnpm | `"packageManager": "pnpm@12.16.1"` in the root `package.json` |
| Dependencies | Exact versions + committed `pnpm-lock.yaml`; install only with pnpm |
| Prisma | **7.10.1** exact (`prisma`, `@prisma/client`, `@prisma/adapter-pg`). Never added without a version (npm's `latest` pointed to an 8.0 release candidate on 2026-11-06). |
| Next.js / NestJS / Postgres | Next.js 16, NestJS 12, Postgres 18. Upgrades go in their own PR, coordinated with E11. |

---

## 10. Observability (later phases)

- `GET /health/live` (process up) and `GET /health/ready` (database reachable, HTTP 503 if not).
  Implemented; the Redis check is added with the first Redis feature.
- Planned: structured JSON logs with request IDs and scrubbed private fields; job monitoring (queue depth,
  failed jobs, retries, ERP/Teams sync freshness, mail status); error tracking and uptime alerts
  (tools chosen in Phase 5).

---

## 11. Open questions

1. Hosting for staging / production (Phase 3, after checking free-tier terms).
2. Hosted Redis provider and its limits (Phase 3).
3. Isolated code runner for AI-01 (code execution with resource and network limits).
4. File storage for PDFs and profile photos.
5. Retention, recovery (RPO/RTO) and load targets.
6. Whether Cache Components (Next.js default) stays on (E01 to confirm).
7. Where invitations are stored (E01; no table yet) and the E01 SRS mismatch.
8. Content of the 50-course seed catalog.
9. Running the DB-backed e2e tests in CI (Postgres is already available there).
10. The lint rule from §3.5.

---

## 12. Changelog

| Date | Change |
|---|---|
| 2026-11-06 | Monorepo, pnpm + Turborepo, Node 26, Next.js 16, NestJS (ESM, Vitest, oxlint), Postgres 18 on port 5433, per-app env files, Prisma 7.10.1, CI gate steps 1–6 + smoke test, `@bs23/contracts` and `@bs23/ui`, module folders with owner READMEs. Repo made public for rulesets. |
| 2026-11-11 | Module layering (MVC) drafted. |
| 2026-11-16 | E11 becomes the only reviewer and the architecture/schema owner (earlier E01/E10). A second ruleset `ci-required` was tried and switched off. |
| 2026-11-19 | Final v1 schema (one `schema.prisma`) and `init` migration (PR #12). Login IDs as primary keys. No `CourseVersion`, no `TECHNICAL` badge. Local seed data (PR #14). |
| 2026-11-20 | Module layering accepted; empty skeletons for all 13 feature modules registered (PR #15). `pnpm setup:local`, `Migration guard`, seed in CI (PR #16). `PR title` check and auto labels (PR #17). Required checks: CI, `Migration guard`, `PR title`; `ci-required` ruleset deleted; head branches auto-deleted after merge. |
| 2026-11-23 | ADR 0001, 0002 and 0003 combined into this file. PRD, SRS, week 1 brief and the data-model template removed from the repository. Rule 3.3 #7 (identity only from `req.user`). e2e tests run in CI. |
| 2026-11-23 | Shape of `req.user` documented (`sub`, `sid`, `workspaceId`, `role`); login role `TRAINEE` vs resource type `TRAINEE` clarified. |
