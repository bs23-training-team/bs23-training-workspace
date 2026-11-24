# ASSUMPTIONS — Daily Sprint (E06)

Every default used while building the sprint module. Anything the SRS marks **[Proposed]** or
**[Verify]**, plus every place where the Build Order's assumed repository layout did not match the
real one. Each entry says what was decided and why.

**Rule:** when the SRS says *use the SRS default*, we use it and record it here. We do not invent a
new behaviour. If an owner answers differently later, only the value in this file changes.

| Field | Value |
|---|---|
| Owner | E06 |
| Module | `apps/api/src/modules/sprint` |
| Created | 2026-11-23 |
| Sources | PRD v1 (final, 2026-11-17), Daily Sprint SRS v1.0 (2026-11-19), Build Order Part 1, `docs/architecture.md`, `apps/api/prisma/schema/schema.prisma` |

---

## 1. Repository reality vs. the Build Order's assumptions

The Build Order was written before this repository existed in its current shape. It describes
`src/sprint/`, `src/stubs/`, `src/lib/api.ts` and `src/lib/types.ts`. None of those paths are real.
The **phase order** and the **business rules** of the Build Order are followed exactly; the **file
locations** follow `docs/architecture.md` and `docs/repo-structure.md`, because those are what CI
enforces.

| # | Build Order assumed | Repository reality | Decision |
|---|---|---|---|
| A1 | Module in `src/sprint/` | `apps/api/src/modules/sprint/` — one of 13 owned module folders (architecture §3.1) | Use `apps/api/src/modules/sprint/`. Follow the layout in this folder's `README.md`: `<m>.controller.ts`, `<m>.service.ts`, `dto/`. |
| A2 | Stubs in `src/stubs/` | No stubs folder; architecture §3.3 rule 5 says modules talk through exported services or outbox events | Cross-module calls go through **ports** defined in this module, with a local implementation that emits an `OutboxEvent`. No `src/stubs/`. |
| A3 | Read `src/lib/types.ts` (Phase 0 step 0.1) | **Does not exist.** `apps/web/src/features/*/` are README-only; there is no `types.ts` or `api.ts` in the web app | Types come from the Prisma schema and the SRS §5.3/5.4 tables. `API-MAPPING.md` replaces the "list the api.ts functions" step. |
| A4 | Replace mock calls in `src/lib/api.ts` (Phase 8) | There are **no mock calls**; the web feature folder is empty | **This round is API-only** (owner decision, 2026-11-23). `packages/contracts/src/sprint/index.ts` gets the shared types; the web client is a later task. |
| A5 | Auth stub reads `x-dev-user` / `x-dev-pm` headers, `DEV_AUTH_STUB=true` | **Forbidden by the module owner.** E01's real guard (`JwtAuthGuard`) is merged into `develop` and sets `req.user` | **No header-based auth anywhere.** Identity comes from `req.user` only, through E01's `JwtAuthGuard`. See §3. |
| A6 | `prisma db push`, do not commit migration files | Architecture §5.2 and `scripts/check-migrations.sh` require **one committed migration per PR**; CI checks schema↔migration drift | Use `pnpm db:migrate --name <reason>`, read the generated SQL, commit the migration folder. |
| A7 | "Never edit the schema" | `apps/api/prisma/schema/README.md`: "Change **only your own section**". E06 owns the E06 section | The five SRS §10 findings (F-01, F-02, F-03, F-05) are E06's to fix, plus the Appendix-A CHECK constraints. Nothing outside the E06 section is touched. |
| A8 | Write `prisma/seed.ts` | `apps/api/prisma/seed/seed.ts` is **E11-owned** (architecture §5.4: "The seed file is owned by E11. Module owners create extra test data inside their own tests.") | Sprint test data lives in a separate opt-in script `apps/api/prisma/seed/seed.sprint.ts`, run manually. E11's seed is not modified. |
| A9 | Base path `/api/v1` | `src/main.ts` sets **no global prefix**; existing routes are bare (`/health/live`, `/health/ready`) | Sprint routes are mounted bare: `/sprint/*` and `/pm/sprint/*`. A global prefix is an E11 decision, not E06's. |
| A10 | PostgreSQL assumed | Postgres 18 on local Docker **port 5433**; `DATABASE_URL` for the app, `DIRECT_URL` for the CLI; `PrismaPg` adapter | Repo conventions (architecture §5.3, §8). |
| A11 | Add `class-validator`, `class-transformer`, `@nestjs/schedule`, `ExcelJS`, `Luxon` | `class-validator` and `class-transformer` are **already on `develop`** (E01 uses them); `exceljs` was missing | Adding `exceljs` (owner approved 2026-11-23), pinned. **Not** adding `@nestjs/schedule` (BullMQ is the sanctioned worker, architecture §2.3) and **not** `luxon` (see A12). |
| A12 | One time-zone helper using Luxon or date-fns-tz | E09 already ships `growth-core/time/org-time.ts` using a **fixed UTC+6 offset** | Copy E09's proven shape exactly, so both modules agree. Asia/Dhaka is UTC+6 with no DST, so a fixed offset is exact — no library needed. |
| A13 | Response envelope `{ data, meta }` / `{ error } }` (SRS §5.2) | E01 owns the shared error format and is not merged. E09 ships `GrowthErrorFilter` producing `{ error: { code, message } }` | Same envelope shape as E09 so it can be swapped later. `details` is added where the SRS needs it (`CELL_CONFLICT`). |

---

## 2. Open questions — resolved

The SRS §12 lists OQ-1 to OQ-13 plus PRD Q10/Q11. The Build Order Phase 0 asks us to confirm
OQ-2, OQ-4, OQ-8 and OQ-9 against the UI. **The UI does not exist in this repository**, so those
four cannot be confirmed against code. Each falls back to the SRS default, which is what the Build
Order instructs.

| OQ | Question | Decision | Why |
|---|---|---|---|
| **OQ-1** | Does the sheet derive values from `SprintTask`, or is it a separate PM notebook? | **Derive on read; stored edits win.** `PLAN` is never derived. | SRS §12 default. The Build Order risk table also asks for derivation to live in **one function** so it can change without touching the rest. |
| **OQ-2** | Exact sheet columns and who writes `PLAN` | **`YESTERDAY`, `HOURS`, `TODAY`, `BLOCKERS`, `PLAN`** — exactly the `SheetColumn` enum already in the schema. `PLAN` is written only by a PM. | The enum in `schema.prisma` is the schema the UI types were built from (SRS §6.5). Cannot be verified against UI code because there is none. |
| **OQ-3** | Do `PENDING` tasks appear in the sheet? | **Yes**, with an "awaiting approval" marker. The sheet cell carries a `pending` boolean. | SRS §12 default (DS-06.7). |
| **OQ-4** | When is Submit done? Edits after submit? Weekend? Zero tasks? | **Allow submit always; do not block.** Second submit on the same day → 409 `ALREADY_SUBMITTED`. | SRS §12 default (DS-03.8). |
| **OQ-5** | The no-reply job is missing from the PRD job list | **Build it as DS-09** and flag it to the PRD owner in `HANDOFF.md`. | SRS §12 (owner = PRD owner). We do not silently change the PRD. |
| **OQ-6** | Who manages `TaskOwner` rows? | **Seed/test data only.** No screen exists (F-14). | SRS §12 default. |
| **OQ-7** | Where do `DsMeeting` rows come from? | **Seed/test data now**, Teams sync later. `createdById` is made optional (F-03) so a sync can insert without a PM. | SRS §12 default + F-03. |
| **OQ-8** | Is carry forward automatic or a button? | **Both, idempotently.** `POST /sprint/carry-forward` creates the rows; `GET /sprint/board` also returns read-only `carryCandidates`. | SRS §12 default (DS-04.4). |
| **OQ-9** | Does the UI have `plannedHours`? | **Keep it.** The schema was built from the UI types, so it existed. | SRS §12 default. |
| **OQ-10** | Keep `DsSheetCellVersion`? | **Keep.** It is already in the schema and already migrated. It is what makes the conflict dialog (US-68) able to show who changed what. | Schema reality; F-13 says it is harmless. |
| **OQ-11** | Where is the XLSX built? | **Backend, with ExcelJS** (owner confirmed 2026-11-23). | SRS DS-06.10. |
| **OQ-12** | Which time zone is "org local time"? | **`Asia/Dhaka`**, UTC+6 fixed offset, no DST. | SRS §12 default (BR-03). Matches E09's helper so the two agree. |
| **OQ-13** | Does a weekly report mean the Monday-to-Sunday sprint week? | **No — the SRS default was overridden on 2026-11-23.** A weekly report means the **report week**: **Sunday through Friday**, with only Saturday off. The **sprint week** stays Monday-to-Sunday exactly as it was. | The SRS §12 default (DS-07.2) assumed the report reuses the sprint week. The domain rule is that the **reporting** calendar and the **sprint** calendar are two different calendars, so a report window can never move a sprint week. See **L13** and **L14** in §13.2 for the rules and §13.4 for the live re-verification. |
| **Q10** | Trainee/traineeId naming, user ID format | **`User.userId`** (e.g. `BS23001`) and **`Pm.pmId`** (e.g. `PM002`). Already the case in the schema. | Architecture §4.1, ADR 0003. |
| **Q11** | Performance targets | Not defined. No performance work beyond adding `@@index([workspaceId, date])` (F-05) and paginating lists. | NFR-I is a proposal, not a requirement. |

---

## 3. Authentication and identity — the strict rule

**The rule:** caller identity comes **exclusively** from `req.user`. Never from a header, a body, a
query parameter or a path parameter. If `req.user` is missing, the endpoint answers **401**.

E01's guard (`apps/api/src/modules/identity/guards/jwt-auth.guard.ts`, merged into `develop` in
PR #22) sets:

```ts
request.user = {
  sub: owner.account.id,     // Pm.pmId (e.g. "PM001") or User.userId (e.g. "BS23001")
  sid: session.id,
  workspaceId: owner.account.workspaceId,
  role: owner.account.role,  // 'PM' | 'TRAINEE'
};
```

Decisions that follow from it:

| # | Decision | Why |
|---|---|---|
| B1 | A PM's id is `req.user.sub`; a user's id is `req.user.sub`. | E01 puts the login id in `sub`. There is no separate `pmId`/`userId` field in `req.user`. |
| B2 | `role === 'PM'` → PM actor; `role === 'TRAINEE'` → user actor. **All four user resource types** (TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT, SBU) take the user branch — they have identical sprint features (PRD §4). | E01 stores every non-PM account as role `TRAINEE`; the resource type is informational. |
| B3 | Missing `req.user`, missing `sub`, or missing `workspaceId` → **401**. Role present but not allowed for the route → **403**. | PRD NFR-08. The sprint module uses E01's `RolesGuard` for the role check, so the whole API answers the same way. |
| B4 | The sprint routes run **E01's `JwtAuthGuard`**, not a local copy of it. The sprint module's own guard only turns `req.user` into an actor. | `docs/architecture.md` §3.3 rule 7 prescribes `JwtAuthGuard` + `RolesGuard`; a second auth implementation would be a second place to get identity wrong. |
| B5 | Tests set `req.user` directly on the request object. No header is read in any code path, including tests. | The rule is about *how identity is obtained*, and a header would still be a spoofable second channel. |
| B6 | A `userId` supplied in a request body or query is **never** trusted. It is checked against the caller's scope and rejected if it is out of scope. | SRS §5.2: "A client-supplied user ID is never trusted alone." PRD EP-14. |

### 3.1 The role vocabulary

`req.user.role` is the **login role**: `'PM'` or `'TRAINEE'`. It is *not* the resource type.
`User.resource` is one of `TRAINEE`, `CENTRAL_LND`, `INDUSTRIAL_ATTACHMENT`, `SBU`, and every
`User` account signs in as the login role `TRAINEE` (docs/architecture.md §4.2). The sprint module
therefore has exactly two actor kinds, `PM` and `TRAINEE`, matching the login role.

---

## 4. Cross-module writes

Architecture §3.3 rule 5: a module may read another module's tables but must not write them.

| # | Decision | Why |
|---|---|---|
| C1 | **XP**: the on-time sprint XP event is written through a **port** (`XpLedgerPort`). The local implementation emits an `OutboxEvent`; when E09 ships its real ledger, the port implementation is swapped. E09's `growth-core` is still an empty skeleton on `develop`. | §3.3 rule 5. `XpEvent` belongs to E09's schema section. |
| C2 | **XP amount and cutoff**: `XpRule.sprintCutoff` and `XpRule.onTimeSprint` are **read** directly from the table (reading is allowed). The cutoff is read at submit time only. | §3.3 rule 5 permits reading. `XpRule` is the PRD's stated source (BR-04). |
| C3 | **Approval mail**: queued through a **port** (`ApprovalMailPort`). The local implementation writes an `OutboxEvent` in the same transaction as the task. | DS-02.1 asks for task + mail request in one transaction. The transactional outbox is exactly that. E08's `MailService` already carries the `TASK_OWNER_APPROVAL` purpose and a `sprintTaskId`, so it is the sender later; the request row is created here so it can share the task's transaction. |
| C4 | **Notifications**: created through a **port** (`NotificationPort`). The local implementation writes an `OutboxEvent`. `Notification` belongs to E01's section. | §3.3 rule 5. The notice and the change it reports commit together. |
| C5 | **Calendar**: the working-day rule (Friday+Saturday weekend, `PublicHoliday`) is implemented in this module for now, behind a `CalendarPort`. The local implementation reads `PublicHoliday` directly (reading another module's table is allowed); E07 owns holidays and the rule is shared (FR-ATT-08). | PRD BR-02. The port makes the swap to E07 mechanical. |
| C6 | **Streak source**: E09's `SprintSourcePort` expects `submissionsOf(db, userId)` returning `{ day, onTime }[]`. This module exposes that shape. | E09's `growth-core/ports/sprint-source.port.ts` on `origin/feat/e09-growth-core`. |

---

## 5. Business rules taken from the PRD

| # | Rule | Source |
|---|---|---|
| D1 | Weekend is **Friday and Saturday**. A sprint week starts **Monday** and ends **Sunday**; **Sunday is a working day**. | PRD BR-01, BR-02; SRS BR-16. |
| D2 | A week runs Monday→Sunday, so the working days inside it are Mon, Tue, Wed, Thu, Sun. Carrying forward from Thursday lands on Sunday. | SRS BR-16; test T-19. |
| D3 | "Today" is the organisation's local day, always. Database timestamps are UTC. | PRD NFR-06; BR-03. |
| D4 | `onTime` is true only when the org-local time is **strictly before** the cutoff. 09:59 → on time; 10:00 → not on time. | PRD BR-05; SRS E-01/E-02. |
| D5 | `onTime` is **frozen at submission**. Changing the cutoff later never changes an old row. | PRD FR-DS-03; SRS DS-03.5. |
| D6 | One submission per user per day, enforced by `@@unique([userId, date])`. | Schema; BR-06. |
| D7 | The owner's reply is **decided once**, atomically: `UPDATE ... WHERE verification = 'PENDING'`. A second attempt is 409. | PRD NFR-08; BR-07; F-06. |
| D8 | A PM sees only users with `User.pmId = pmId` and only teams with `Team.pmId = pmId`. A user sees only their own data. | PRD NFR-08; BR-08. |
| D9 | Delete is **soft** (`deletedAt`). Deleted tasks never appear on the board, history, sheet or reports. The UI asks "Delete task?" before the call. | PRD NFR-07; BR-09. |
| D10 | Overwriting another editor's sheet cell raises the conflict dialog. | PRD FR-DS-06; BR-10. |
| D11 | Missing data is shown as **missing**, never as zero, and every report figure carries a source label. | PRD NFR-09; BR-17. |
| D12 | An archived user (`archivedAt` set) creates no new tasks and submits nothing; their history stays readable. | SRS E-25. |
| D13 | PM-page meeting scheduling and task planned start/end are **not** re-added. | PRD non-goals; BR-12. |

---

## 6. Behaviour details the PRD leaves open

| # | Situation | Decision | Basis |
|---|---|---|---|
| E1 | An archived user calls a board or submit endpoint | **422** with a clear message; existing history still readable | SRS E-25. |
| E2 | A task is created with a category but no owner, or an owner but no category | **422** `VALIDATION`. The DB also enforces it (CHECK `chk_task_category_iff_owner`). | DS-01.3, F-01. |
| E3 | `plannedHours` / `actualHours` above 24 | Allowed. Only ">= 0" is a requirement and the DB checks it. The 24-hour cap is a [Proposed] suggestion and the UI is not built, so no cap is invented. | DS-01.8. |
| E4 | Carry forward is called for a date with no previous working day | Returns an empty list, 200. | DS-04.2. |
| E5 | A sheet cell's user is not a member of the week's team | **403** `FORBIDDEN_SCOPE`. | DS-06.5, P-27. |
| E6 | A user left a team mid-week | The row is shown only for the dates they were a member. | SRS E-20 [Verify] — the membership row keeps `leftAt`, so it is decidable from data. |
| E7 | "Upcoming" window for the meeting banner | The next meeting whose `scheduledAt` is in the future, today or later. | DS-08.5 [Verify] — no UI to check against; this is the least surprising reading. |
| E8 | A report period with no data for a user | The row exists with **missing** markers, not zeros. | D11 / NFR-09. |
| E9 | The `SheetColumn` order in the grid and the XLSX | `YESTERDAY, HOURS, TODAY, BLOCKERS, PLAN` — the order of the enum in the schema. | OQ-2. |

---

## 7. Things we are NOT doing

| # | Not doing | Why |
|---|---|---|
| F1 | No header-based authentication of any kind. No `x-dev-user`, `x-dev-pm`, `x-actor-*`, `x-workspace-id`. | Module owner rule, 2026-11-23. Also: E08's web client explicitly avoids spoofable identity headers. |
| F2 | No `DEV_AUTH_STUB` and no dev-only sign-in bypass. | Same rule. The Build Order's Phase 1 stub is deliberately not used. |
| F3 | No edits to `app.module.ts`, `packages/contracts/src/index.ts`, E01's seed, the `init` migration, or any other module's files. | Architecture §3.1, §5.2, §5.4. |
| F4 | No new `.prisma` file. Only the E06 section of `schema.prisma` changes. | `apps/api/prisma/schema/README.md`. |
| F5 | No `prisma db push`; no uncommitted migration folder. | A8. |
| F6 | No `DROP TABLE` / `DROP COLUMN` / `ON DELETE CASCADE` in our migration SQL. | `scripts/check-migrations.sh`; architecture §5.2. |
| F7 | No PM-page meeting scheduling, no task planned start/end, no "waiting for you" dashboard strip. | D13 — removed on purpose, never re-added. |
| F8 | No web UI this round. | Owner decision, 2026-11-23 (decision 1). |
| F9 | No `prisma db seed` changes to E11's seed file. Sprint data goes in `seed.sprint.ts`. | A8. |

---

## 8. What Phase 2 built

The scaffolding the later phases fill in. Nothing here is a route yet; no controller is
registered, so the API's route list is unchanged.

| File | What it is |
|---|---|
| `time/org-time.ts` | The one place that does time, week and cutoff maths. Fixed UTC+6 (Asia/Dhaka has no DST). The weekend is Friday and Saturday; Sunday is a working day. `isBeforeCutoff` is strictly before: 09:59 is on time for a 10:00 cutoff, 10:00 is not. |
| `time/clock.port.ts` | The injected clock, so the on-time flag and the no-reply job are testable at a fixed moment. |
| `http/actor.ts` | `req.user` → `SprintActor`. The only source of identity. `pmIdOf` / `userIdOf` refuse the wrong role with `FORBIDDEN`. |
| `http/actor.guard.ts` | `SprintActorGuard` (401 without a usable `req.user`) and `@CurrentActor`. `SprintHttp` runs E01's `JwtAuthGuard`, then this guard, then E01's `RolesGuard`, and installs the error filters. |
| `http/sprint-error.filter.ts` | `{ error: { code, message, details? } }` with the SRS's status per code. `details` carries what the UI needs on a `CELL_CONFLICT`. A second filter turns a failed DTO into the same envelope with `VALIDATION_ERROR`. |
| `errors.ts` | `SprintError` and the code vocabulary from the SRS §9 and the endpoint tables. |
| `dto/base.dto.ts` | The validation pipe (`whitelist`, `transform`, `expectedType`) and `@IsDay()`, which refuses a day that is not a real calendar date. |
| `dto/sprint.dto.ts` | The user-side request bodies. |
| `dto/pm-sprint.dto.ts` | The PM-side request bodies. |
| `ports/*.port.ts` | The cross-module channels: XP, approval mail, notifications, calendar. Each takes the transaction handle, so the change and the row it reports commit together. |
| `ports/local-ports.ts` | The local implementations. The three cross-module ones write an `OutboxEvent`; the calendar reads `PublicHoliday` directly. |
| `sprint.module.ts` | Registers the guard, the clock and the four port providers, and imports `IdentityModule` for the auth guard. |

**87 tests** cover the time maths (29), the actor and the 401/403 rules (18), the error envelope
(11), the DTO rules (21) and the local ports (8).

### 8.1 Two decisions Phase 2 had to make

| # | Decision | Why |
|---|---|---|
| G1 | The sprint module's actor role is the **login role**: `'PM'` and `'TRAINEE'`. | It is the role vocabulary of the whole API, so `req.user.role` needs no translation. E09's unmerged branch uses a different vocabulary (`'USER'`); this module follows the merged, documented style instead. |
| G2 | The sprint module imports E01's `IdentityModule` and uses its `JwtAuthGuard` and `RolesGuard`; it does **not** define its own copy. | `docs/architecture.md` §3.3 rule 7 prescribes exactly this. A second auth implementation would be a second place to get identity wrong — and the whole point of the strict rule is that there is only one. |

---

## 9. What Phase 3 built

The nine user-side endpoints (U1–U9, plus U10's banner). The controller is thin; the service
holds the rules; the repository holds the queries.

| File | What it is |
|---|---|
| `sprint.controller.ts` | The nine routes. Every one runs `SprintHttp()` and takes its caller through `@CurrentActor()`. No header is read; no `userId` is accepted from the client. |
| `sprint.service.ts` | The rules: scope, ownership, the category⇔owner rule, the archive rule, the carry-forward rule, the two-week window, the pagination cursor. |
| `sprint.repository.ts` | Every Prisma query. Each `where` carries `workspaceId` and `userId`, and reads of tasks add `deletedAt: null`. |
| `dto/sprint-response.dto.ts` | The response shapes, including `SprintFigure { value, source }` so a missing number is never shown as a zero (D11 / NFR-09). |

**179 tests** now cover the sprint module (90 from Phase 2, plus 89 new): 39 in the service spec,
33 in the route spec (through a real Nest application with the real guards and filters), 17 in
the repository spec.

### 9.1 The rules Phase 3 had to decide

| # | Decision | Why |
|---|---|---|
| H1 | A failed DTO answers **422** `VALIDATION_ERROR`, not Nest's 400. | SRS §9 and `errors.ts` both say 422. A task with negative hours is a well-formed request for something not allowed, not a malformed request. |
| H2 | `GET /sprint/meeting` answers `{ meeting: ... \| null }`, not a bare `null`. | Nest serialises a bare `null` return as an empty body `{}`. The banner is wrapped so the client can read one key. |
| H3 | The category⇔owner rule is checked **before** any database lookup. | A mismatch is a fact about the request, not about the rows. Checking it first keeps the answer the same whether or not the caller exists. |
| H4 | A user id in a query string is ignored, not rejected. | The whitelist DTO drops it and the query is scoped to the token's id. Silently ignoring it is the same answer as a wrong one, without a second channel for identity. |
| H5 | Numeric query and body fields carry `@Type(() => Number)`. | Query parameters arrive as strings. Without the transform, `?limit=10` failed validation with a 422. |
| H6 | An unexpected failure is caught by a catch-all filter and answered **500** with the shared envelope and a fixed message. | Nest's own 500 shape (`{ statusCode, message }`) would break the one shape the client can rely on. The original message stays in the server's log, never in the answer — it can carry a database detail the caller has no business seeing. |

### 9.2 Verified live, against the real database

A throwaway probe signed a real token for the seeded user `BS23001` and called the running
server. It confirmed: the board and the task list read back what was written; a created task
appears on the board and disappears again after the soft delete; the update round-trips;
`CATEGORY_OWNER_MISMATCH` answers 422; negative hours answers 422 `VALIDATION_ERROR`; carry
forward with no candidates answers 200 with an empty list; a request stuffed with
`x-dev-user`, `x-dev-pm`, `x-actor-role`, `x-workspace-id` and a `?userId=PM001` still resolves
the caller from the token alone; and a request with no token answers 401
`UNAUTHENTICATED`. The probe and its rows were deleted afterwards.

---

## 10. What Phase 4 built

`POST /sprint/submit` (U7, FR-DS-03): submit the sprint for today, freeze the on-time flag and
hand the XP over to E09.

| File | What changed |
|---|---|
| `sprint.controller.ts` | The `POST /sprint/submit` route. It takes no body: the day is the org-local today and the user is the signed-in one. |
| `sprint.service.ts` | `submitSprint`. Reads the workspace's rule, decides the on-time flag, writes the submission and the XP award in one transaction. |
| `sprint.repository.ts` | `findXpRule` (a **read** of E09's table), `findSubmission`, `createSubmission` and `createSubmissionTx` (the write, through the transaction handle). |
| `dto/sprint-response.dto.ts` | `SprintSubmissionView` — the day, the instant, the frozen flag and the XP that was earned. |
| `errors.ts` | `isUniqueViolation` — the check on Prisma's `P2002`, the way E01 does it. |

**33 new tests** (212 in the module, 434 in the API): 18 service rules, 9 HTTP contract, 6
repository queries.

### 10.1 The rules Phase 4 had to decide

| # | Decision | Why |
|---|---|---|
| I1 | The unique-constraint refusal becomes a **409** `ALREADY_SUBMITTED`. | The index on `[userId, date]` is what enforces one submission per day (PRD BR-06). A refusal the caller can act on is a conflict, not a crash. |
| I2 | Only a `P2002` becomes a conflict. **Any other database failure is left alone.** | Dressing a real failure up as a conflict hides it. The caller would retry forever against a broken database. |
| I3 | The on-time flag is decided **once**, at submit time, and stored on the row. | PRD BR-05: changing the cutoff later never changes an old submission. Verified live — moving the cutoff after the submit left the stored flag alone. |
| I4 | "On time" is **strictly before** the cutoff. | 09:59 is on time for a 10:00 cutoff; 10:00 is not. This is the rule `isBeforeCutoff` already had (D4); the submit is its first caller. |
| I5 | The workspace's rule is **read** at submit time, and the schema's defaults are the fallback. | `XpRule` belongs to E09; reading another module's table is allowed (rule 5). E09 seeds the row, so it is normally there — the fallback (`10:00`, `20` XP) is the schema's own default, so a workspace that is not set up yet still behaves exactly as the schema says. |
| I6 | The XP award goes through the `XpLedgerPort`, **inside the submission's transaction**. | `XpEvent` belongs to E09, so the sprint module must not write it (rule 5). The port writes an `OutboxEvent` through the same transaction handle, so a rolled-back submission awards no XP and a committed one always does — the two cannot disagree (DS-03.6). |
| I7 | A late submission awards **no** XP and no event is written. | Only an on-time sprint earns the XP (PRD BR-04). |
| I8 | The answer carries `xpAwarded`, so the UI can show the XP without a second call. | The amount comes from `XpRule.onTimeSprint` and is what the award recorded. |
| I9 | The submit is **never blocked**: no tasks, a weekend, a day with nothing to show. | OQ-4 and SRS DS-03.8: submit is always allowed; only a second submit for the same day is refused. |

### 10.2 Verified live, against the real database

A throwaway probe signed a real token for the seeded user `BS23001` and submitted against the
running server and the real database. It confirmed:

- the first submit answers **201** and writes a `SprintSubmission` row with the frozen flag,
- a late submit writes `onTime: false` and **no** XP event,
- an on-time submit (the workspace cutoff was moved later for the run and restored afterwards)
  writes `onTime: true` and an `xp.sprint_on_time` outbox event carrying the key
  `sprint:BS23001:2026-11-23`, the amount and `status: PENDING` — and **nothing** is written
  to E09's `XpEvent` table,
- **the frozen flag survives a cutoff change**: after the submit, moving the cutoff to `00:01`
  left the stored row at `onTime: true`,
- the second submit answers **409** `ALREADY_SUBMITTED` in the shared envelope,
- a request stuffed with `x-dev-user`, `x-actor-role`, `x-workspace-id` and a `userId` in the
  body still submits as the token's user, and
- a request with no token answers **401** `UNAUTHENTICATED`.

The probe, its rows and its outbox events were deleted afterwards, and the workspace cutoff was
put back to `10:00`.

---

## 11. What Phase 5 built

The owner verification: the PM records the owner's answer (P7, FR-DS-02), and the job that
tells the PM when the owner has not answered for a day (S1, FR-DS-09).

| File | What it is |
|---|---|
| `pm-sprint.controller.ts` | The PM-side route (P7). It is the first `/pm/sprint/*` route; the PM sheet routes join it in Phase 6. |
| `pm-sprint.service.ts` | The PM's rules: `recordOwnerReply` (P7) and `runNoReplyCheck` (S1). |
| `sprint.repository.ts` | `findTaskForOwnerReply` (the task with the PM who manages its user), `decideOwnerReply` (the conditional write), `findWorkspacesWithPendingTasks`, `findStalePendingTasks` (the raw query with the row lock), `markPendingAlertSent`. |
| `sprint.module.ts` | Registers the PM controller and the PM service. |

**52 new tests** (264 in the module, 486 in the API): 23 service rules, 13 repository
queries, 16 HTTP contract.

### 11.1 The rules Phase 5 had to decide

| # | Decision | Why |
|---|---|---|
| J1 | The decision is a **conditional** write: `UPDATE ... WHERE verification = 'PENDING'`. | PRD BR-07 and SRS F-06: the reply is decided once. A plain `update` cannot say "only while it is still pending" — it would overwrite a decision that was already made. The count the write returns is what tells the service "somebody else was faster". |
| J2 | The **scope** is decided from the row: the task is read together with the PM who manages its user. | PRD BR-08, SRS DS-02.5. The client's ids are never used for the scope. A task of another PM's user answers 403 `FORBIDDEN_SCOPE` and **nothing** is written. |
| J3 | The scope is checked **before** the state, so an out-of-scope task cannot be probed for its state. | A PM who cannot touch a task has no business learning whether it was answered. The order also means the refusal is the same whether or not the task has an owner. |
| J4 | A task that needs **no** verification (no owner) answers **404**, not a 409 or a 422. | There is no owner to answer, so the request does not describe anything that can be decided. 404 says "there is no such task to answer", which is what is true. |
| J5 | The notice is written **inside the decision's transaction**. | DS-02.6: the answer and the report of it commit together. A rolled back decision leaves no notice. The loser of a race sends no notice either — only the winner's decision is reported. |
| J6 | The job **escalates, it never decides**. | DS-09: the job tells the PM that the owner has not answered. The task stays `PENDING`; deciding it is the PM's job (P7). |
| J7 | The job escalates **exactly once** per task. Two guards: `FOR UPDATE SKIP LOCKED` on the pick-up, and a conditional `updateMany` (`pendingAlertSentAt IS NULL`) on the write. | DS-09.3. The lock alone is not enough — it protects the pick-up, not the write, and a job that crashes between the two would alert twice. The conditional write is the real guard. |
| J8 | The job has **no HTTP route**. It is a plain method, `runNoReplyCheck(now)`. | It runs on a schedule, not on a request. Nobody should be able to trigger it over HTTP. The `now` argument makes it testable at a fixed moment and lets a worker pass its own instant. |
| J9 | The job scans **every** workspace, because it is not called on behalf of anybody. | It is the system asking on its own. A workspace with nothing to escalate is never read. |
| J10 | The PM-side rules live in their **own service**, `PmSprintService`, beside the user-side `SprintService`. | One module, one folder, two services: the user's rules ("what is my day") and the PM's rules ("has the owner answered, and who may say so") are different questions with different actors. The layout still follows `docs/architecture.md` §3.4 — the file names say whose rules they are. |

### 11.2 Verified live, against the real database

Two throwaway probes signed real tokens for `PM001`, `PM002` and `BS23001` and ran against
the running server and the real database. They confirmed:

- `PM002` recording an answer for a task of `PM001`'s user answers **403**
  `FORBIDDEN_SCOPE`, and **nothing** is written,
- a user recording an answer answers **403** `FORBIDDEN`; no token answers **401**
  `UNAUTHENTICATED`,
- `PM001` recording an answer answers **200** and the row carries `VERIFIED`,
  `ownerRepliedAt` and `ownerReplyById: PM001`,
- a **second** answer answers **409** `ALREADY_DECIDED` and the stored decision is
  unchanged,
- exactly one `notification.sprint` outbox event was written, carrying the PM as the
  recipient,
- the job escalated the one stale task and set `pendingAlertSentAt`, while leaving the task
  `PENDING` with no reply,
- the **second** run of the job escalated **0** and wrote no second notice.

**The decide-once rule under real concurrency.** Ten replies fired at the same moment
against one task produced **one 200 and nine 409s**, one decision on the row and exactly
**one** notice. The conditional write holds the invariant under a real race, not only in a
test with a fake repository.

The probes, their tasks, their notices and their task owner were deleted afterwards. The
database rule tests still pass 14/14.

---

## 12. What Phase 6 built

The PM's team sheet: the weeks of a team (P1, P2), the sheet itself (P3), the edit of a cell
(P4) and the XLSX download (P5) — FR-DS-06.

| File | What it is |
|---|---|
| `pm-sheet.controller.ts` | The five PM sheet routes, under `/pm/sprint`. |
| `pm-sheet.service.ts` | The PM's sheet rules: `listWeeks` (P1), `addSprintWeek` (P2), `getSheet` (P3), `saveCell` (P4), `getSheetForExport` (P5). |
| `pm-sheet.xlsx.ts` | The workbook, built with ExcelJS (`buildSheetWorkbook`). |
| `dto/pm-sheet-response.dto.ts` | The shapes the sheet answers with. |
| `sprint.repository.ts` | Twelve new queries (see 12.1). |
| `sprint.module.ts` | Registers the sheet controller and the sheet service. |

**109 new tests** (373 in the module, 595 in the API): 41 service rules, 21 repository
queries, 36 HTTP contract, 11 XLSX.

### 12.1 The queries Phase 6 added

`findTeam`, `findSprintWeeks`, `findSprintWeek`, `findSprintWeekByStart`,
`createSprintWeek`, `findTeamMembers`, `findTasksForSheet`, `findSheetCells`,
`findSheetCell`, `saveSheetCellIfVersion`, `createSheetCell`, `createSheetCellVersion`.

Every one of them carries the workspace. Two of them decide the scope from the row:
`findSprintWeek` selects the team with its `pmId`, and `findTeam` selects `Team.pmId` — so
the service can answer `FORBIDDEN_SCOPE` without trusting the client.

### 12.2 The rules Phase 6 had to decide

| # | Decision | Why |
|---|---|---|
| K1 | The week is created by the service, not by the client. The client sends a day; the service decides what a week is. | Appendix A: `chk_sprintweek_monday`. A Tuesday is refused with **422** `WEEK_START_NOT_MONDAY` before anything is written, and the database refuses it again if some other path tries. |
| K2 | The same team and the same Monday answer **409** `WEEK_EXISTS`. | The unique index `SprintWeek_teamId_weekStart_key` refuses it; the `P2002` is turned into a conflict rather than a 500. The service also looks the week up first, so the common case never reaches the index. |
| K3 | Every cell carries a **`source`**: `DERIVED`, `STORED` or `EMPTY`. | PRD NFR-09: missing data is shown as missing, never as zero. The client can tell "the PM wrote this" from "this was worked out" from "there is nothing here". |
| K4 | A stored cell wins over a derived one; `PLAN` is **never** derived. | OQ-2: the plan is the PM's own. Deriving it would show a value nobody wrote. |
| K5 | The edit is a **conditional** write: `UPDATE ... WHERE id = ? AND version = ?`. | SRS US-68. A plain `update` cannot say "only while it is still at the version the editor saw" — it would overwrite a cell somebody else changed. The count the write returns is what tells the service "somebody else was faster". |
| K6 | The conflict carries `details: { expectedVersion, currentVersion, currentValue }`. | US-68 wants a conflict dialog. The dialog has to show what the other editor wrote, so the conflict is not just a refusal. |
| K7 | The old value goes to `DsSheetCellVersion` in the **same transaction** as the new one. | The history and the cell can never disagree, and a rolled back edit leaves no history row. |
| K8 | A first edit sends `expectedVersion: 0`; a non-zero version for a cell that does not exist answers **409** `CELL_CONFLICT`. | Version 0 is the version of "no stored row yet". Any other number says the editor saw a row that is gone, which is a conflict, not a create. |
| K9 | The scope is decided from the **row**, and `teamId` / `weekId` / `userId` are keys, never authority. | Architecture §3.3 rule 7. A `pmId` in the body is ignored; a team of another PM answers **403** `FORBIDDEN_SCOPE` and nothing is read or written. |
| K10 | A cell may only be written for a **member** of the team the week belongs to. | The sheet is the team's sheet. A row for somebody who is not on the team would put a stranger's week on the PM's sheet. |
| K11 | Monday's `YESTERDAY` column is read from the **Sunday before** the week. | The column means "what did this person do yesterday", and for Monday that is the last day of the week before. |
| K12 | The sheet reads tasks from **one day before** the Monday through the Sunday. | Without the day before, Monday's `YESTERDAY` column would always be empty. |
| K13 | The export is built on the **backend** with ExcelJS. | OQ-11. The file is a workbook, not JSON, so it cannot be assembled in the browser from the same route shape. |
| K14 | The workbook has **one row per member per day** — seven rows for a member who works the whole week. | The sheet is read as a grid per day; the print-out keeps that shape instead of collapsing a week into one wide row. |
| K15 | The exported file is verified by **reading it back**, not by checking its bytes. | A file that cannot be opened again is not an export. The spec re-opens the workbook with ExcelJS and asserts the title, the headers, the values and the fill colour. |
| K16 | `getSheetForExport` reuses `getSheet` and adds nothing. | The download is the same sheet; two code paths would drift. |
| K17 | The sheet's own rules live in their **own service**, `PmSheetService`, beside `PmSprintService`. | Same rule as J10: one module, one folder, and the file names say whose rules they are. |

### 12.3 Verified live, against the real database

One throwaway probe signed real tokens for `PM001`, `PM002` and `BS23001` and ran against the
running server and the real database. It confirmed:

- P1 lists the weeks of the PM's own team (**200**), answers **401** without a token, and
  refuses a team of another PM with **403** `FORBIDDEN_SCOPE`,
- P2 refuses a Tuesday with **422** `WEEK_START_NOT_MONDAY`, accepts a Monday (**201**),
  and refuses the same Monday again with **409** `WEEK_EXISTS`,
- the **database** `chk_sprintweek_monday` refuses a week that does not start on a Monday,
- P3 answers the grid: one row per member (4), seven days per row, starting on the Monday,
  with Friday and Saturday marked as the weekend,
- P4 creates the cell (version 1), edits it (version 2), and answers **409** `CELL_CONFLICT`
  with `details.currentVersion = 2` and `details.currentValue` for a stale version,
- the stale edit did **not** overwrite the cell, and the version went up to exactly 2,
- the old value was written to the history (one row), and the author and the updater hold
  the XOR the database checks,
- a user answering the cell route gets **403**,
- the sheet shows the **stored** edit (`source: STORED`), not a derived value,
- P5 answers a workbook that opens again, carries the team and the week in its title, and has
  one row per member per day (4 + 7 × 4 = 32 rows),
- P3 refuses a week of another PM with **403**.

**31/31 checks passed.** The probe's rows — the week, the cells, the history and the outbox
events — were deleted afterwards, and the extra team it needed for the cross-PM check was
removed too. The database rule tests still pass 14/14.

**No migration was needed.** Appendix A's invariants (`chk_sprintweek_monday`,
`chk_dscell_author`, `chk_dscell_updater`, `chk_dscellver_editor`) and the two unique
indexes were already in the live database, so Phase 6 changed no schema.

---

## 13. What Phase 7 built

The PM's sprint report (P6 — FR-DS-07, US-69) and the hardening of the meeting banner
(U10 — FR-DS-08).

| File | What it is |
|---|---|
| `pm-reports.controller.ts` | The one report route, `GET /pm/sprint/reports`, under `/pm/sprint`. |
| `pm-reports.service.ts` | The report rules: `getReports` (P6). |
| `dto/sprint-response.dto.ts` | The report shapes: `SprintReportType`, `SprintReportRow`, `SprintReportView`. |
| `time/org-time.ts` | `monthStart` and `monthEnd` — the month maths lives here, like every other day maths — plus the **report week** helpers `reportWeekStart`, `reportWeekEnd`, `reportWeekDays` and `isReportVacationDay`. |
| `sprint.repository.ts` | Four new queries (see 13.1). |
| `sprint.module.ts` | Registers the report controller and the report service. |

**85 new tests** (373 → 458 in the module, 595 → 680 in the API): 37 service rules,
14 repository queries, 27 HTTP contract, 7 for the U10 banner.

The later **report-week fix** (L13/L14) added **14 more** — 8 for the report-week helpers in
`time/org-time.ts` and 6 for the new window boundaries — so the module now has **472** and the
API **694**.

### 13.1 The queries Phase 7 added

`findReportUsers`, `findReportTeamUsers`, `findReportTasks`, `findReportSubmissions`.

Every one of them carries the workspace. The task query filters `deletedAt: null`, so a
deleted task is never in a report (ASSUMPTIONS D9).

The membership query **deliberately does not filter `leftAt`**: only the service knows the
period of the report, and a member who left **inside** the window still belongs to it. The
member's own `pmId` and `archivedAt` are selected so the service can apply the scope rule.

### 13.2 The rules Phase 7 had to decide

| # | Decision | Why |
|---|---|---|
| L1 | The four windows: `daily` is the day; `weekly` is the **report week** that contains the day (Sunday through Friday, Saturday excluded — L13); `biweekly` is the **two report weeks ending with** that one; `monthly` is the **calendar month**. | The biweekly window **ends with** the week so the windows **nest** (daily ⊂ weekly ⊂ biweekly) — a PM who looks at a week sees the same days inside the fortnight. A month is not a report week, so the monthly report is a calendar month and not a number of weeks. |
| L2 | One row per **user**, and every figure is a `SprintFigure` with a source. | US-69: "every report option shows hours and blockers per user". The shape is the module's existing `SprintFigure` — no parallel shape was invented. |
| L3 | **Missing is not zero.** A figure is `MISSING` when the source table has **no rows** for that user in the window. | PRD NFR-09 and ASSUMPTIONS E8. A user who never submitted has no "days submitted" value; it is not `0`. |
| L4 | **A real zero is a zero.** When the table **has** rows that sum or count to zero, the figure is `0` with its real source. | L3 is about the rows, not about the number. A user who has a task worth zero hours has a **real zero** (`TASK`); a user who submitted late has **zero** on-time days (`SUBMISSION`). Showing those as missing would hide a fact. |
| L5 | The scope is `User.pmId = pmId`; an archived user is left out. | ASSUMPTIONS D8. A PM sees their own people and nobody else's, and an account that is closed is not part of a report. |
| L6 | A team report covers the members of that team **that the PM manages** — a member another PM manages is left out. | D8's **both** halves apply: the team the PM manages, and the people the PM manages. The seeded data has exactly this case: `BS23004` is managed by `PM002` and is a member of `PM001`'s team. |
| L7 | `teamId` is a **key, not authority**: the team is looked up and its PM compared with the signed-in PM. | The same rule as P1–P5 (architecture §3.3 rule 7). A team of another PM — and a team that does not exist — answer **403** `FORBIDDEN_SCOPE` with **nothing read**, so the caller cannot probe for other PMs' teams. |
| L8 | A member who **left before** the window is left out; a member who left **inside** it stays, and their row shows the figures as missing. | A membership that ended before the period has nothing to report for it. A membership that ended inside it did have days in the period, and the row says so honestly — with missing figures, not zeros. |
| L9 | The report has **its own service**, `PmReportsService`, beside `PmSprintService`. | The same rule as J10 and K17: one feature, one service, and the file name says whose rules they are. `PmSprintService` hard-depends on `NOTIFICATIONS`; a read-only report has no business injecting that port. |
| L10 | The report **only reads**. It writes nothing and takes no port. | The report reads `SprintTask`, `SprintSubmission`, `User`, `Membership` and `Team`, and writes to none of them (architecture §3.3 rule 5). |
| L11 | The month maths lives in `time/org-time.ts`, not in the report service. | That file's stated rule is "no other file computes a day, a week or a cutoff". A month is a day range, so it belongs there. |
| L12 | The U10 banner was **hardened**, not changed: it already answered `{ meeting: ... \| null }`. | The gap was the **contract**: nothing asserted that the route answers 401 without a token, 403 for a PM, or that the caller comes from `req.user` and not from a client value. Those are now asserted. |
| L13 | The **report week** runs **Sunday through Friday**, with **only Saturday** off. Saturday is excluded from the active report days. | The reporting calendar is **not** the sprint calendar. A report week covers six active days (Sunday, Monday, Tuesday, Wednesday, Thursday, Friday) and Saturday is the gap between one report week and the next. A Saturday belongs to the week that started the day before it, so `reportWeekStart('2026-11-21')` is `2026-11-15`, not `2026-11-22`. |
| L14 | The **sprint week is untouched**: `SprintWeek.weekStart` is still a **Monday**, the weekend is still **Friday and Saturday**, and the database still refuses a week that does not start on one (CHECK `chk_sprintweek_monday`). | The report week is a **report-window** idea only. P1–P5 (the sheet, the week creation, the carry-forward rule) keep their own calendar, so moving a report window can never move a sprint week. The two calendars are offset by a day at each end, which is why the report week needs its **own** helpers (`reportWeekStart`, `reportWeekEnd`, `reportWeekDays`, `isReportVacationDay`) rather than reusing `weekStart`/`weekEnd`. |

### 13.3 Verified live, against the real database

One throwaway probe signed real tokens for `PM001`, `PM002` and `BS23001`, created its own
tasks, submissions and meeting, and ran against the running server and the real database. It
confirmed:

- P6 answers **401** without a token (in the shared envelope), **403** `FORBIDDEN` for a user,
  and **422** `VALIDATION_ERROR` for an unknown `type` or a day that is not a real date,
- the four windows are exactly right: daily `2026-11-18…2026-11-18`, weekly
  `2026-11-16…2026-11-22`, biweekly `2026-11-09…2026-11-22` (the two weeks **ending with**
  it) and monthly `2026-11-01…2026-11-30`,
  — **these four were captured before the report-week fix (L13/L14) and were re-verified
  afterwards; see 13.4**,
- the all-teams report answers `teamId: null` and has a row per user the PM manages,
- **`BS23004` is in PM001's team but PM001 does not manage them**, and they are **not** in
  the report — neither in the all-teams report nor in the team report,
- the figures: BS23001's hours are summed and labelled `TASK`, their submitted and on-time
  days are labelled `SUBMISSION`, and their blocker is listed,
- **missing is not zero**: BS23002, who has no task, has `MISSING` hours and a `MISSING` task
  count — not `0` — while their on-time days are a **real zero** with `source: 'SUBMISSION'`,
  because they did submit and it was late,
- BS23003, who has neither a task nor a submission, has `MISSING` for every figure,
- a team report answers the team and answers **403** `FORBIDDEN_SCOPE` for a team of another
  PM — **and the same for a team that does not exist**,
- the spoofing headers (`x-dev-pm`, `x-dev-user`, `x-actor-role`, `x-workspace-id`) and the
  spoofing query (`pmId`, `userId`, `workspaceId`) are **ignored**: the answer is still
  PM001's own report,
- U10 answers the meeting with its day and time in org time (`2026-11-24`, `11:30`), answers
  **401** without a token and **403** `FORBIDDEN` for a PM, ignores the spoofing header and
  query, and answers `{ meeting: null }` when there is no meeting.

**44/44 checks passed.** The probe's rows — the tasks, the submissions, the meeting and the
extra team it needed for the cross-PM check — were deleted afterwards, and the database is back
to its seeded state (no sprint rows, no outbox events, one team). The database rule tests
still pass 14/14.

**No migration was needed.** Every table the report reads — `SprintTask`, `SprintSubmission`,
`User`, `Membership`, `Team` — already existed with the columns the report needs, so Phase 7
changed no schema.

### 13.4 The report-week fix — re-verified live

The report window was later moved to the **Sunday-to-Friday report week** (L13/L14). The four
window figures in 13.3 were captured under the old Monday-to-Sunday calendar, so a **second
throwaway probe** re-checked the windows against the running server and the real database. It
wrote nothing, so the database stayed at its seeded state.

**14/14 checks passed:**

- daily of `2026-11-23` is `2026-11-23…2026-11-23`,
- weekly of **Monday** `2026-11-23` is **`2026-11-22…2026-11-27`** — the Sunday to the
  Friday, and **not** the Saturday `2026-11-28`,
- weekly of **Sunday** `2026-11-22` is the same week,
- weekly of **Saturday** `2026-11-21` is the week that started on Sunday `2026-11-15`
  (`2026-11-15…2026-11-20`) — a Saturday belongs to the week **before** the next Sunday,
- biweekly of `2026-11-23` is **`2026-11-15…2026-11-27`** — the two report weeks **ending
  with** that week,
- biweekly of **Sunday** `2026-12-06` crosses the month boundary correctly:
  `2026-11-29…2026-12-11`,
- monthly of `2026-11-23` is the calendar month `2026-11-01…2026-11-30`,
- **the sprint week is untouched**: every sprint week still starts on a **Monday**, and a
  sprint week that does not start on one is still refused with **422**,
- the auth contract is unchanged: **401** without a token, **403** for a user, and the
  spoofing query (`pmId`, `userId`, `workspaceId`) is still **ignored** — the rows are still
  PM001's own users.

The database rule tests still pass **14/14**, including `chk_sprintweek_monday`: a Monday
`weekStart` is accepted and a Tuesday one is refused.

---
---

## 14. What Phase 8 built — the shared contracts and the web client

Phase 8 did **not** add an endpoint and it did **not** change a rule. It moved the sprint
module's vocabulary into one place, so that the API, the web client and the other squads
cannot drift apart, and it wrote down the hand-off contracts.

### 14.1 The files

| File | What it is |
|---|---|
| `packages/contracts/src/sprint/index.ts` | **The whole shared vocabulary**: every answer shape, the figure type and its sources, the four report types, the sheet columns, the owner decisions, the outbox event types, the three outbox payload shapes and the two port interfaces. |
| `apps/api/src/modules/sprint/dto/sprint-response.dto.ts` | Now a **re-export** of the contracts — the API's answer shapes *are* the contracts. |
| `apps/api/src/modules/sprint/dto/pm-sheet-response.dto.ts` | Now a **re-export** of the contracts, plus the old names as aliases so the module's own code keeps compiling. |
| `apps/api/src/modules/sprint/dto/sprint.dto.ts` | Its vocabulary (`TASK_CATEGORIES`) now comes from `SPRINT_TASK_CATEGORIES`. |
| `apps/api/src/modules/sprint/dto/pm-sprint.dto.ts` | Its vocabularies (`SHEET_COLUMNS`, `OWNER_DECISIONS`, `SPRINT_REPORT_TYPES`) now come from the contracts. |
| `apps/web/src/features/sprint/api.ts` | **The web client** — every sprint endpoint, one function each. |
| `apps/web/src/features/sprint/index.ts` | What the pages import. |
| `apps/web/src/features/sprint/README.md` | The client's rules in short: the identity rules, the two calendars, missing-is-not-zero. |
| `apps/web/package.json` | Gained `"@bs23/contracts": "workspace:*"`. |
| `apps/api/src/modules/sprint/HANDOFF.md` | Rewritten around the shared contracts, the exact outbox payloads, the port interfaces and the web client. |

### 14.2 The rules Phase 8 had to decide

| # | Decision | Why |
|---|---|---|
| M1 | The **shared vocabulary** lives in `packages/contracts/src/sprint/index.ts`, and the API's DTO files **re-export** it rather than re-declaring it. | One definition, used by the API and the web client. The API cannot drift from the contracts, because it does not have its own copy to drift with. |
| M2 | The class-validator **request** DTOs stay in `apps/api`, but the **vocabularies** they validate against (`SPRINT_TASK_CATEGORIES`, `SPRINT_SHEET_COLUMNS`, `SPRINT_OWNER_DECISIONS`, `SPRINT_REPORT_TYPES`) come from the contracts. | A validation class cannot live in a shared type package — it needs `class-validator` decorators, which are an API concern. But the *words* it accepts must be the shared ones, or the API and the web client would disagree about what a valid category is. |
| M3 | The shared names carry a `Sprint` prefix (`SprintFigure`, `SprintReportView`, `SprintSheetView`, …). | `packages/contracts/src/index.ts` is a flat barrel that re-exports every module's folder. Without a prefix, E06's `SprintFigure` would collide with another module's `Figure` in the barrel. |
| M4 | The **old sheet names** (`SavedCellView`, `SheetCellView`, `SheetDayView`, `SheetRowView`, `SheetColumnValue`) are kept as **aliases** in `dto/pm-sheet-response.dto.ts`. | The module's own code and its tests have always used those names. Renaming them everywhere would be churn for no gain; the aliases keep the old names working while the contracts carry the prefixed ones. |
| M5 | `SprintOwnerReplyView` is an **alias of `SprintTaskView`**, not a shape of its own. | `POST /pm/sprint/tasks/:id/owner-reply` answers the **whole task** after the decision. A second shape would be a second thing to keep in step. |
| M6 | The **report week** is in the contracts, and the sprint week is **not** mixed with it: `SPRINT_REPORT_TYPES` is about the report window; `SprintWeekView` is about the Monday-to-Sunday sprint week. | L13/L14. The two calendars are offset by a day at each end, so a UI that assumes one when it means the other shows the wrong days. The contracts file states the table at the top for exactly this reason. |
| M7 | The web client sends **only** `Authorization: Bearer <token>`, and **no** `x-dev-user`, `x-dev-pm`, `x-actor-*` or `x-workspace-id` header, and **no** client-supplied `pmId`/`userId`/`workspaceId`. | The API takes the caller from the access token **only**. A client that sent a dev header would be relying on something the API does not read — and the API's route tests assert that those headers are ignored. |
| M8 | A `teamId` or a `userId` in a query is a **key into the caller's own scope**, never authority. | The same rule as L7 on the API side. The web client documents it so a page cannot be written to pass a `pmId` "for convenience". |
| M9 | The web client's errors are a **`SprintApiRequestError`** that keeps the API's own `code` and `status`. | The message alone cannot tell **"not yours"** (`FORBIDDEN_SCOPE`) from **"fix the form"** (`VALIDATION_ERROR`). The code is what the UI branches on. |
| M10 | The web client ships **`formatSprintFigure`** (a dash for a missing value), **`isMissingSprintFigure`** and **`sprintSourceLabel`**, and the README says to use them instead of reading `figure.value`. | PRD NFR-09. The helpers make the missing-is-not-zero rule a one-liner at the call site, so a page cannot collapse a `null` into `0` by accident. |
| M11 | The XLSX export (`P5`) is fetched as a **blob**, not parsed as JSON. | The export answers a **file download**, not the JSON envelope. Parsing it would fail. |
| M12 | The web client's `exportSprintSheet` is the only call that does not go through the shared `request` helper — it needs the blob. | The shared helper parses JSON. One exception, kept in one place, rather than a second helper for a single call. |
| M13 | The **outbox payload shapes** and the **event types** are in the contracts (`SPRINT_OUTBOX_TYPES`, `SprintNotificationPayload`, `SprintXpAwardPayload`, `SprintApprovalMailPayload`), and the API's ports match them exactly. | The payload is a **contract between two modules**. Typing the strings on both sides is how they drift. The API's `ports/local-ports.ts` writes exactly these fields, and `HANDOFF.md` now shows the three payloads verbatim. |
| M14 | The **port interfaces** are in the contracts without the transaction handle (`SprintCalendarPort`, `SprintXpLedgerPort`); the API's own ports keep it (`tx` as the first argument). | The transaction handle is the API's own concern — a port implementation must write through it. The shared shape is the part another module implements against. |
| M15 | The web app gained a real dependency on `@bs23/contracts`. | E08's web client had **duplicated** the sprint types locally. A duplicate is a copy that drifts; the dependency makes the shared file the only one. |

### 14.3 What did **not** change

- **No endpoint.** Phase 8 added no route, no service method and no repository query.
- **No rule.** Every rule of Phases 3–7 stands exactly as it was, including L13/L14 (the
  report week) and NFR-09 (missing is not zero).
- **No schema and no migration.** The contracts are TypeScript types; the schema did not move.
- **No identity change.** The API still takes the caller from `req.user` only, through
  `JwtAuthGuard` → `RolesGuard` → `SprintHttp()`. The web client mirrors that posture; it
  did not make the API more permissive.

### 14.4 Verified

- `packages/contracts` — typecheck and build pass.
- `apps/api` — typecheck, lint, build and the **full** test suite pass (**694/694**).
- `apps/web` — typecheck, lint and build pass.
- The web client's functions were checked one by one against the API's route table in
  `API-MAPPING.md`: every endpoint the client calls exists, with the same method, path and
  body, and every function's answer is the contracts' type.

---

## 15. What Phase 9 built — the hardening, the seed and the quality gate

The last phase of E06. It added **no new endpoint**: the 18 routes of Phases 3–7 are the module.
What Phase 9 did was make them **safe under the conditions nobody tests on purpose** — two
requests at once, a cell outside the week, a database that refuses a write — and give the module
a demo dataset and a green quality gate.

### 15.1 The files

| File | What it is |
|---|---|
| `apps/api/prisma/seed/seed.sprint.ts` | The sprint demo data. Idempotent, calendar-correct, scope-correct. |
| `apps/api/prisma/migrations/20261123160000_e06_sprint_schema_fixes/migration.sql` | The carry-forward index (the only change to the migration in this phase). |
| `apps/api/prisma/schema/schema.prisma` | The `// DB:` comment for that index (Prisma cannot express a partial index). |
| `apps/api/src/modules/sprint/sprint.repository.ts` | `copyTaskIfNotCarried` — the copy in a savepoint. |
| `apps/api/src/modules/sprint/sprint.service.ts` | The carry-forward writes through that method. |
| `apps/api/src/modules/sprint/pm-sheet.service.ts` | The week-boundary check on a saved cell. |
| `apps/api/src/modules/sprint/db-rule-tests.sql` | The rule test for the new index; its own team, so it works on a seeded database. |
| `apps/api/src/modules/sprint/SCHEMA-CHANGES.md` | §2a — the carry-forward index and why it is a database rule. |
| `package.json`, `apps/api/package.json` | `db:seed:sprint`. |

### 15.2 The rules Phase 9 had to decide

| # | Rule | Why |
|---|---|---|
| N1 | A task is carried forward **at most once**, decided by a **unique index** on `carriedFromId`. | The rule was enforced by a *read* before the write, which is not atomic. Two requests at the same moment both read the same open task and both copied it. Only the database can decide at the moment of the write. |
| N2 | The index is **partial** (`WHERE "carriedFromId" IS NOT NULL`). | Most tasks are not copies. The partial form says what the rule is — one copy per source task — and keeps the index small. |
| N3 | A refused copy is **not an error**: the answer is 200 and the task is left out. | The idempotency rule working is not a failure. The first request's copy stands; the loser simply does not see the task in its own answer. |
| N4 | Each copy is written in a **savepoint**. | Without it, the refused insert would abort the whole transaction and undo the copies that had already succeeded. |
| N5 | Only a **unique violation** is treated as the idempotency rule. Any other database failure is left alone and becomes a 500. | A real failure must not be dressed up as a rule. |
| N6 | A cell's day must be **inside the sprint week** it is saved against (422 `VALIDATION_ERROR`). | The sheet renders exactly the seven days of the week, so a cell outside it would be an orphan a PM could write but never see again. The week runs Monday to Sunday. |
| N7 | The seed covers only the users **PM001 manages**. | The demo must show the same scope rule as the report: BS23004 is in the team but is managed by PM002, so PM001's report does not show them. |
| N8 | The seed's sprint weeks are **Mondays**, and no task sits on a **Friday or a Saturday**. | The two calendars stay apart: the sprint week is Monday→Sunday, the report week is Sunday→Friday. A seed that mixed them would show the wrong days. |
| N9 | The seed is **idempotent**: the stable key of a task is (workspace, user, day, title). | Running it again updates the row instead of adding a second one, and a task deleted by hand comes back. |
| N10 | The seed refuses to run against a **non-local** database unless `ALLOW_REMOTE_SEED=true`. | The same guard as `seed.ts`. A stray run must not put demo tasks in somebody's real database. |
| N11 | The DB rule tests create **their own team**. | Reusing a seeded team broke the "a Monday weekStart is accepted" case the moment the seed had a week for that Monday — the unique index refused the row and the refusal looked like the CHECK firing. |
| N12 | The hardening changed **no endpoint, no route and no contract**. | The 18 routes are the module. The fixes are inside them. |

### 15.3 Verified

- The **18 endpoints** were swept for identity, scope, atomicity and source semantics.
- **Zero** header-auth backdoors in `apps/api/src`: no `x-dev-user`, `x-dev-pm`, `x-actor-*`,
  `x-workspace-id`, no `headers[...]` read outside a test.
- All four route spec files carry 401 (no token), 403 (wrong role) and **anti-spoofing** tests
  (the dev headers and a client `?userId=` / `?pmId=` are ignored).
- The migrations apply **from scratch** on a throwaway database: 3 migrations, all green, and the
  carry-forward index exists with the right definition.
- The DB rule tests: **18/18 PASS, 0 FAIL** (14 before, plus the 4 carry-forward cases).
- The sprint seed: **3 runs, identical row counts** (33 tasks, 6 submissions, 3 sprint weeks,
  3 task owners, 1 sheet cell, 1 meeting).
