# PR — E06 Daily Sprint (Phase 9: hardening, seed, quality gate)

> Local review notes. Nothing is pushed; the branch `rehearsal/e06-sprint-task` is local only.
> This file follows `.github/pull_request_template.md`.

## What does this PR do?

Hardens the E06 Daily Sprint module, adds the sprint demo seed and closes the quality gate.

The hardening found and fixed **one genuine concurrency defect**: the rule "a task is carried
forward at most once" (DS-04.4) was enforced only by a `SELECT` inside the transaction. A read
followed by a write is not atomic, so two concurrent `POST /sprint/carry-forward` calls (a double
click, two tabs) both read the same open task and both inserted a copy of it. The database now
decides — a partial unique index on `("carriedFromId")` — and the copy is written in a **savepoint**
so one refused copy does not undo the copies that already succeeded. A refused copy is the
idempotency rule *working*, not a failure: the endpoint still answers **200** and leaves that task
out of the answer.

The hardening also found **one edge case**: a sheet cell could be saved against a day outside the
sprint week it belonged to. The sheet renders exactly the seven days of the week, so such a cell
would be an orphan a PM could write but never see again. It is now **422** `VALIDATION_ERROR`.

**No endpoint, route, DTO or contract changed.** The hardening is below the API surface.

## Module / owner

E06 — Daily Sprint. Owner: the E06 squad.

## Related requirements

| FR | Requirement | Endpoints |
|---|---|---|
| FR-DS-01 | Board and task creation | U1, U2, U3 |
| FR-DS-02 | Owner verification | U3, P7, S1 |
| FR-DS-03 | Submit sprint | U7 |
| FR-DS-04 | Carry forward, summary, history, delete | U2, U5, U6, U8, U9 |
| FR-DS-05 | Blockers visible to the PM | P3, P6 |
| FR-DS-06 | Team sheet | P1–P5 |
| FR-DS-07 | Sprint reports | P6 |
| FR-DS-08 | Meeting banner | U10 |
| FR-DS-09 | "No reply after a day" job | S1 |

User stories **US-63 … US-70**. PRD **BR-05** (carry-forward is idempotent), **NFR-09** (a missing
value is never shown as a zero).

## Type of change

- [x] Feature
- [x] Bug fix
- [ ] Refactor
- [x] Docs
- [x] Infra / CI / config

## Database

- [x] This PR includes a Prisma migration
- [x] The migration was regenerated after rebasing on the latest `develop`
- [x] No column/table is dropped or renamed (otherwise E11 agreed on the plan beforehand)

**One migration folder** for the whole PR (`20261123160000_e06_sprint_schema_fixes`) — the
migration guard allows at most one per PR. The Phase 9 addition is a partial unique index:

```sql
CREATE UNIQUE INDEX "SprintTask_carriedFromId_key"
  ON "SprintTask"("carriedFromId")
  WHERE "carriedFromId" IS NOT NULL;
```

It is **partial** because most tasks have no source (`carriedFromId IS NULL`), and NULLs are never
equal — so the rule is "one copy per source task", not "one task in the whole table". The index
also says what the rule is, and it is smaller: it only holds the rows that are copies. Prisma
cannot express a partial index, so the migration creates it by hand and the schema carries a
comment saying so.

Verified from scratch on a throwaway database (`bs23_migtest`): all 3 migrations apply, and
`pg_indexes` confirms the index exists with the `WHERE` clause. The test database was dropped.

## Environment variables

- [x] No new environment variables
- [x] New variables were added to `.env.example` with fake values and are listed here:

  <!-- VARIABLE_NAME – what it is for -->

The seed adds one **opt-in** variable, `ALLOW_REMOTE_SEED=true`, and it is a guard rather than a
requirement: the sprint seed refuses to touch a database that is not on this machine unless the
variable is set. It is deliberately **not** in `.env.example` — a value that has to be typed on
purpose is the point of the guard. `NODE_ENV=production` is refused unconditionally.

## How was it tested?

**Unit / route tests — 706/706 pass** in `apps/api` (39 files).

The Phase 9 work added **8 tests**:

| File | Tests | What they cover |
|---|---|---|
| `sprint.repository.spec.ts` | +4 | the copy points back at its source; the copy is written in a savepoint; a unique violation answers `null` (the rule working); any other database failure is **not** dressed up as the rule |
| `sprint.service.spec.ts` | +2 | a task another request carried in the meantime is left out; the other tasks are still carried when one is refused |
| `pm-sheet.service.spec.ts` | +3 | a day before the week and a day after it are 422; a day inside it is accepted |

**Database rule tests — 18/18 PASS, 0 FAIL** (was 14; Phase 9 added the carry-forward
idempotency cases: a task with no source accepted, the first copy accepted, a second copy of the
same source refused).

The rule test now creates **its own team** instead of reusing a seeded one. Reusing a seeded team
would break the "a Monday `weekStart` is accepted" case the moment the seed has a sprint week for
that Monday — the unique index on `[teamId, weekStart]` would refuse the row, and the refusal would
look like the CHECK firing.

**Seed — idempotent.** Three consecutive runs produce identical counts: 33 tasks / 6 submissions /
3 sprint weeks / 3 task owners / 1 sheet cell / 1 meeting. The base `pnpm db:seed` still works and
does not wipe the sprint rows.

**Quality gate (run the way CI runs it, via Turbo):**

| Gate | Result |
|---|---|
| `pnpm turbo run typecheck` | **6/6** pass |
| `pnpm turbo run lint` | **4/4** pass (api: 7 warnings / 0 errors — all pre-existing, in `identity/rate-limit.spec.ts`) |
| `pnpm turbo run test` | **3/3** pass (api **706/706**) |
| `pnpm turbo run build` | **4/4** pass |
| `db-rule-tests.sql` | **18/18** PASS, 0 FAIL |
| `prisma migrate status` | Database schema is up to date |

**Database cleanliness** — verified after the gate:

- 33 tasks / 6 submissions / 3 sprint weeks / 3 task owners / 1 sheet cell / 1 meeting / 0
  notifications / 0 outbox events.
- **0** orphan carried-forward copies (every `carriedFromId` points at a real task).
- **0** duplicate carried sources.
- **0** sprint weeks that do not start on a Monday.
- **0** tasks on a Friday or a Saturday.
- **0** sprint rows outside the seeded workspace.

**The security sweep across all 18 endpoints:**

- **Zero header-auth backdoors** in `apps/api/src` — no `x-dev-user`, `x-dev-pm`, `x-actor-*`,
  `x-workspace-id`, and no `headers[...]` read outside a test. Every hit in the repository is
  documentation or a test asserting the header is **ignored**.
- Identity comes from `req.user` **only**, through E01's `JwtAuthGuard`. Missing token → **401**;
  wrong role → **403**; out-of-scope → **403 `FORBIDDEN_SCOPE`**.
- **Anti-spoofing coverage** in all four route spec files (sprint 4, pm-sheet 1, pm-sprint 1,
  pm-reports 1 request groups): the spoofing headers and a client-supplied `?userId=` / `?pmId=`
  are all ignored.
- Workspace and PM scope isolation asserted on **every** repository query — each one carries the
  caller's `workspaceId`, and the PM routes additionally compare `Team.pmId` with the signed-in PM.
- **Atomic transitions**: the owner reply and the cell save are conditional `UPDATE`s (the row
  changes only while it is still `PENDING` / at the expected version), and the submit is refused
  by the unique index on `[userId, date]` and turned into a **409** rather than a 500.
- **Explicit source semantics**: every report figure carries `TASK` / `SUBMISSION` / `DERIVED` /
  `MISSING`. A missing value is never a fake zero, and a real zero (a task worth 0 hours) is not
  missing.

## Checklist

- [x] `pnpm lint`, `pnpm test` and `pnpm build` pass locally
- [x] No secrets, `.env` files or real user data are included
- [x] I only changed other modules' folders where necessary, and I told their owners before opening this PR
- [ ] The PR is small enough to review (ideally under ~400 changed lines)

**The last box is deliberately unticked**, and it is the one thing a reviewer should push back on:
the whole E06 module is **8 commits** over the branch, not one. Splitting them into reviewable
PRs is a decision for the owner, not something the module should decide for itself. The natural
slices would be the schema + migration (a8b4ef9 and d519e4e), the user-side API (a8b4ef9), submit
+ XP (6b9f527), owner verification + the job (222bd83), the PM sheet (36de443), the reports
(da9beba, 236cbef) and the contracts + web client (af13bd1, a8280d0).

### Files changed in this Phase 9 commit

| File | Change |
|---|---|
| `apps/api/prisma/migrations/20261123160000_e06_sprint_schema_fixes/migration.sql` | the partial unique index on `("carriedFromId")` |
| `apps/api/prisma/schema/schema.prisma` | the comment that records the hand-made index |
| `apps/api/prisma/seed/seed.sprint.ts` | **new** — the sprint demo seed |
| `apps/api/src/modules/sprint/sprint.repository.ts` | `copyTaskIfNotCarried` (savepoint + unique-violation handling) and `findCarryCandidatesTx` |
| `apps/api/src/modules/sprint/sprint.service.ts` | `carryForward` delegates the copy and skips a refused one |
| `apps/api/src/modules/sprint/pm-sheet.service.ts` | the cell must belong to the week it is saved against |
| `apps/api/src/modules/sprint/db-rule-tests.sql` | the carry-forward idempotency cases; the rule test gets its own team |
| `apps/api/src/modules/sprint/*.spec.ts` | +8 tests |
| `apps/api/src/modules/sprint/{ASSUMPTIONS,API-MAPPING,HANDOFF,SCHEMA-CHANGES}.md` | §15 (N1–N12), the carry-forward paragraph, the week-boundary paragraph, the seed section, §2a |
| `apps/api/package.json`, `package.json` | `db:seed:sprint` |

### For the reviewers

Two things in this PR are worth a close look, because they are the only places where the module
**reached past the API surface**:

1. **The partial unique index.** It is the only hand-written SQL in the schema. It is inside the
   E06 migration folder (not a new one), it is additive, and it drops nothing — but it is the part
   to check against the migration guard.
2. **The savepoint in `copyTaskIfNotCarried`.** It is what makes "one refused copy does not undo
   the others" true. If it were removed, the first refused copy would abort the whole transaction
   and silently drop the copies that had already succeeded.

The seed is demo data and never runs against production (`NODE_ENV=production` is refused), but it
is the piece most likely to need a change once other modules' seeds land — it depends on the
workspace, the team, the PM and the trainees that `seed.ts` creates.

### Known follow-ups (not in this PR)

- Two stale dev servers are listening on ports **4000** (PID 21184) and **4100** (PID 23052).
  They need to be killed from your side — `taskkill` is blocked by the agent sandbox.
