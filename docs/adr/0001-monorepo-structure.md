# ADR 0001: Monorepo Structure, Tooling and Delivery Foundation

| Field | Value |
|---|---|
| Status | **Proposed**: skeleton implemented (PR #1, #2); awaiting team / E01 / mentor approval |
| Date | 2026-11-05 (updated 2026-11-06, see [Changelog](#17-changelog)) |
| Author | E11 (DevOps) |
| Deciders | E01 (architecture owner), E11, all module owners E02–E10, mentor/PM |
| Related | `BS23_Final_PRD_EN.pdf` v3.1, `BS23_Final_SRS_EN.pdf` v3.1 |

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

```
bs23-training-workspace/
├── apps/
│   ├── web/                          # Next.js (App Router) — UI only, proxies to API
│   │   ├── src/app/                  # routes (PM + trainee workspaces)
│   │   ├── src/features/<module>/    # module-specific UI, one folder per module
│   │   └── Dockerfile
│   └── api/                          # NestJS + Prisma — the only source of authority
│       ├── prisma/
│       │   ├── schema/               # multi-file Prisma schema (see §6)
│       │   │   ├── base.prisma       # generator + datasource (E11 + E01)
│       │   │   ├── identity.prisma   # E01
│       │   │   ├── directory.prisma  # E02
│       │   │   └── ...               # one file per module
│       │   ├── migrations/           # ONE shared migration history
│       │   └── seed/                 # dev/test seed only (incl. 50-course catalog)
│       ├── src/
│       │   ├── main.ts               # HTTP server entrypoint
│       │   ├── worker.ts             # background worker entrypoint (BullMQ processors)
│       │   ├── common/               # guards, interceptors, config, logging, health
│       │   └── modules/              # one folder per module (see §5)
│       ├── test/                     # integration / e2e API tests
│       └── Dockerfile                # one image, two commands (api / worker)
├── packages/
│   ├── contracts/                    # shared DTOs, enums, zod schemas, API types
│   ├── ui/                           # shared React components (owner: E10)
│   └── config/                       # shared eslint, prettier, tsconfig presets
├── e2e/                              # Playwright PM + trainee journeys
├── infra/
│   ├── docker-compose.yml            # local Postgres 18 (host port 5433) + Redis 8
│   └── scripts/                      # helper scripts (db reset for local only, etc.)
├── docs/
│   ├── adr/                          # architecture decision records (this file)
│   ├── runbooks/                     # deploy, rollback, restore, incident
│   └── setup.md                      # developer onboarding / local setup
├── .github/
│   ├── workflows/                    # ci.yml, deploy-staging.yml, deploy-prod.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
├── apps/api/.env.example             # API variables, NO real values (copy to .env)
├── apps/web/.env.example             # web variables, NO secrets (copy to .env.local)
├── .nvmrc                            # pinned Node version (26)
├── package.json                      # root scripts + "packageManager" pin
├── pnpm-workspace.yaml
├── pnpm-lock.yaml                    # committed; CI uses --frozen-lockfile
└── turbo.json
```

---

## 5. Module ownership map

Folder names are proposals. Final names should be agreed at the contract-freeze meeting.

| Owner | API module (`apps/api/src/modules/`) | Web feature (`apps/web/src/features/`) | Prisma file |
|---|---|---|---|
| E01 | `identity`, `notifications`, `outbox` (shared event foundation), `dashboard` | `shell`, `auth`, `dashboard`, `notifications` | `identity.prisma` |
| E02 | `directory` (trainees, teams, L&D feedback) | `directory` | `directory.prisma` |
| E03 | `assessment` (expertise, attempts, evaluation, AI adapter, appeals, recommendations) | `assessment` | `assessment.prisma` |
| E04 | `catalog` (courses, versions, assignments, requests) | `catalog` | `catalog.prisma` |
| E05 | `learning` (roadmap, topic state, progress) | `learning` | `learning.prisma` |
| E06 | `sprint` (tasks, sheets, DS meetings, code quality) | `sprint` | `sprint.prisma` |
| E07 | `attendance` (ERP/Teams adapters, sync, leave) | `attendance` | `attendance.prisma` |
| E08 | `reports` (drafts, snapshots, PDF, mail) | `reports` | `reports.prisma` |
| E09 | `growth-core` (XP ledger, rules, levels, streaks, badges) | `gamification-core` | `growth-core.prisma` |
| E10 | `engagement` (quests, leaderboard, hackathon, kudos) | `engagement` + `packages/ui` | `engagement.prisma` |
| E11 | `common/health`, `common/config` | — | `base.prisma` (with E01) |
| E11 | Root config, `infra/`, `.github/`, Dockerfiles, `turbo.json`, `docs/runbooks` | | |

**Cross-module rule:** a module calls another module only through that module's exported
NestJS service or through outbox events, never by writing directly to another module's tables.
This matches the SRS ownership boundary (e.g. *E09 alone writes core awards; E10 requests them*).

### CODEOWNERS (initial sketch)

```
# Default: DevOps + architecture owner
*                                   @<E11> @<E01>

/apps/api/src/modules/identity/     @<E01>
/apps/api/src/modules/directory/    @<E02>
/apps/api/src/modules/assessment/   @<E03>
/apps/api/src/modules/catalog/      @<E04>
/apps/api/src/modules/learning/     @<E05>
/apps/api/src/modules/sprint/       @<E06>
/apps/api/src/modules/attendance/   @<E07>
/apps/api/src/modules/reports/      @<E08>
/apps/api/src/modules/growth-core/  @<E09>
/apps/api/src/modules/engagement/   @<E10>
/packages/ui/                       @<E10>
/packages/contracts/                @<E01> @<E11>

# Schema & migrations: everyone touches them, so E01 + E11 must review
/apps/api/prisma/                   @<E01> @<E11>

# Infra & CI
/infra/                             @<E11>
/.github/                           @<E11>
```

(Replace `@<E0x>` with real GitHub usernames. The same mapping applies to `apps/web/src/features/`.)

---

## 6. Database, Prisma and migrations

### 6.1 Multi-file schema

The SRS requires one canonical schema. To avoid 10 people editing one huge `schema.prisma`,
we split it into one file per module inside `prisma/schema/`. Prisma still treats it as **one** schema.

> **⚠ Verify:** Multi-file schema support depends on the Prisma major/minor version. Recent
> Prisma versions support it (it started as a preview feature). Confirm the exact
> configuration for the version we pin. Also check whether our pinned major moves datasource
> URLs into `prisma.config.ts`, since newer majors have changed configuration.

### 6.2 Migration rules (to avoid conflicts)

1. **One migration per PR**, created with `prisma migrate dev --name <module>_<change>`.
2. Before merging, **rebase on `main`**. If `main` received a new migration, delete your migration, regenerate it, and re-test.
3. **Never edit a migration that has been merged** to `main`.
4. CI checks that the schema and the migrations are in sync (no drift), and runs migrations both on an empty DB and as an upgrade from `main`'s state (SRS: *clean and upgrade migrations*).
5. **No destructive changes without a plan**: dropping/renaming columns uses expand → migrate data → contract across separate releases. SRS: *do not cascade-delete historical evidence*.
6. Production migrations run **only** via the deploy pipeline (`prisma migrate deploy`), never from a laptop.

### 6.3 Connections (Neon)

| Variable | Used by | Neon endpoint |
|---|---|---|
| `DATABASE_URL` | Running API + worker | **Pooled** connection string |
| `DIRECT_URL` | Migrations only (CI/deploy) | **Direct** (non-pooled) connection string |

> **⚠ Verify:** exact variable names and where Prisma reads the direct URL depend on the pinned Prisma version and Neon's current docs.

### 6.4 Seeds

- Seeds (including the 50-course initial catalog) run in **local, test and staging only**.
- Production: no seeds or resets (SRS p.9). The real 50-course content is still an open decision (PRD p.9).

---

## 7. Environments

| Environment | Database | Redis | Deployed from | Purpose |
|---|---|---|---|---|
| **local** | Postgres 18 in Docker Compose (host port **5433**) | Redis 8 in Docker Compose (6379) | developer machine | daily development |
| **ci/test** | Postgres service container (fresh per run) | Redis service container | GitHub Actions | automated tests on real PostgreSQL |
| **staging** | Neon (separate project or branch) | hosted Redis (TBD) | auto-deploy on merge to `main` | integration, smoke tests, restore/rollback drills |
| **production** | Neon (separate, protected) | hosted Redis (TBD) | manual approval / release tag | real users |

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
4. Config is validated at startup (NestJS `ConfigModule` + a schema). The app **refuses to start** if a required variable is missing.
5. CI runs a secret scanner (e.g. gitleaks) on every PR.
6. Logs must not contain credentials, private answers or leave reasons (SRS p.9).

---

## 9. Git workflow

- **Two long-lived branches:** `develop` (integration, default branch, deploys to staging) and `main` (production, merged from `develop` at release time by E11/E01 only).
- **Short-lived task branches** (1–3 days) off `develop`: `feat/e04-course-requests`, `fix/e07-leave-dates`, `chore/e11-ci-cache`. No long-lived per-member branches: they cause late, painful integration.
- **Branch ruleset on `main` and `develop`:** PR required, 1 approval, no force-push, no deletion. CI status checks will be added as required once CI exists. Repository admins may bypass the approval for PRs only.
- PR authors merge their own approved PRs into `develop`.
- **Squash merge** with Conventional Commit titles (`feat(catalog): add course request API`).
- Full rules for the team: `CONTRIBUTING.md`.
- PR template: what changed, which user story / SRS IDs, migration included (yes/no), screenshots, test evidence.
- Keep PRs small (ideally under ~400 changed lines). Big PRs slow down review for everyone.

---

## 10. CI/CD pipeline (maps to the SRS release gate)

| # | SRS gate step | Implementation | Phase |
|---|---|---|---|
| 1 | Locked install | `pnpm install --frozen-lockfile` | 2 |
| 2 | Lint / types | `turbo run lint typecheck` (only affected packages) | 2 |
| 3 | Prisma validate / generate | `prisma validate`, `prisma generate` | 2 |
| 4 | Clean + upgrade migrations | `migrate deploy` on empty DB; upgrade test from `main`; drift check | 2 |
| 5 | Backend / domain / access / contract / idempotency tests | Jest against real Postgres + Redis service containers | 2 |
| 6 | Next production build | `turbo run build` | 2 |
| 7 | PM / trainee E2E | Playwright against the built stack | 3–4 |
| 8 | Staging migrations / smoke | deploy to staging → `migrate deploy` → health + smoke tests | 3 |
| 9 | Controlled release + recovery checks | manual-approval production deploy; rollback + restore drill in staging | 4–6 |

Extra checks (not in SRS, recommended): secret scanning, dependency audit, SonarQube Cloud
analysis (already in scope for code quality, QUALITY-01).

---

## 11. Docker

- `infra/docker-compose.yml` for local Postgres + Redis. One command: `docker compose up -d`.
- Multi-stage Dockerfiles using `turbo prune` so each image contains only what it needs.
- `apps/api` builds **one image** that runs as either `api` (`node dist/main.js`) or `worker` (`node dist/worker.js`).
- Containers run as a non-root user, with health checks.

---

## 12. Version pinning

| Item | How |
|---|---|
| Node.js | **26** (Active LTS since 2026-10-28) via `.nvmrc` + `"engines": ">=26 <27"`. Verified: Next.js and NestJS skeletons build and run on Node 26.13.0. |
| pnpm | `"packageManager": "pnpm@12.16.1"` in root `package.json` |
| Dependencies | exact versions + committed `pnpm-lock.yaml` |
| Prisma / Next / NestJS / Postgres | pinned majors, upgraded deliberately in dedicated PRs |

> Resolved 2026-11-06: Node 26 chosen (see table). pnpm is installed directly (Homebrew on macOS), not via Corepack.

---

## 13. Observability (later phases)

- Health endpoints: `GET /health/live` (process up) and `GET /health/ready` (DB + Redis reachable).
- Structured JSON logs with request IDs, with private fields scrubbed.
- Job monitoring: queue depth, failed jobs, retry counts, ERP/Teams sync freshness, mail send status (SRS p.9).
- Error tracking and uptime alerts: tools TBD, free-tier options to be compared in Phase 5.

---

## 14. Consequences

**Positive**
- One `git clone` + one `docker compose up` + one `pnpm dev` gives a working stack for every developer.
- Contract changes are caught in CI before they break another module.
- Schema conflicts are reduced by per-module schema files and clear migration rules.
- CI enforces the SRS release gate automatically.

**Negative / costs**
- Everyone must learn basic pnpm/Turborepo commands (covered in `docs/setup.md`).
- The shared migration history still needs discipline (§6.2). E01 + E11 review all schema PRs.
- Redis adds one more service to host and monitor.
- Monorepo CI needs caching to stay fast as the code grows.

---

## 15. Open questions (to resolve before or during Phase 1)

1. Does E01 / the team accept this layout and the module folder names? (blocking)
2. Who creates and administers the GitHub organization (team or BS23)?
3. Final module folder names. Should they be agreed at the contract-freeze meeting?
4. Hosting providers for staging/production (Phase 3, after free-tier verification).
5. Hosted Redis choice and limits (Phase 3).
6. Isolated code runner design for AI-01 (code execution with resource/network limits). Phase 6, needs its own ADR.
7. File storage for PDFs / profile photos (SRS lists it as an open "supporting host/job/file choice").
8. Retention, recovery (RPO/RTO) and load targets. SRS marks them as pending decisions.

---

## 16. Next steps

1. ~~E11 creates the GitHub org/repo and enables branch protection.~~ Done.
2. ~~E11 pushes the monorepo skeleton, `docker-compose.yml`, `.env.example` files and `docs/setup.md`.~~ Done (PR #1, #2, #3).
3. Every developer follows `docs/setup.md` and confirms the stack runs locally.
4. E11 adds the first CI workflow (gate steps 1–6).
5. Module owners start their modules inside their own folders.

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
