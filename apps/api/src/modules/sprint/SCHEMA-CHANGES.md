# Schema changes — Daily Sprint (E06)

Changes to the **E06 section** of `apps/api/prisma/schema/schema.prisma`, with the reason for each.

**Scope:** the E06 section only (`// ===== E06 · sprint · Daily sprint, sheet, DS meeting =====`),
from `enum TaskCategory` to the end of `model DsMeeting`. No other section is touched, and no new
`.prisma` file is created.

**Why these are ours to make:** the SRS §10 conformance review found five gaps between the schema
and the PRD. The schema README says "Change **only your own section**" — these five gaps are all
inside the E06 section, so E06 fixes them and E11 reviews the PR. The Build Order's "never edit the
schema" rule applies to *another team's* schema; it was written for a squad that did not own one.

**Verification of the current state (read on 2026-11-23):**

- `apps/api/prisma/schema/schema.prisma` lines 1246–1427 hold the E06 section.
- `prisma/migrations/20261119073036_init/migration.sql` already contains
  `chk_task_planned`, `chk_task_actual` (hours ≥ 0) and `chk_dscell_author`,
  `chk_dscell_updater`, `chk_dscellver_editor` (exactly one author/updater/editor).
- It does **not** contain the sprint-specific CHECK constraints from SRS Appendix A. Those are
  added here.

**The migration:** one folder, created with
`pnpm db:migrate --name e06_sprint_schema_fixes --create-only`, read before applying, committed
together with the schema change (architecture §5.2 rule 1).

---

## 1. Prisma changes

### F-01 — `SprintTask.category` must be optional

| | |
|---|---|
| **Severity** | High |
| **Now** | `category TaskCategory` (required) |
| **After** | `category TaskCategory?` |
| **Reason** | A task done **for oneself** has neither a category nor an owner (PRD FR-DS-01). With `category` required, an own task cannot be created at all — the SRS paper test P-01 fails. The schema was built from the UI types, which allowed a category-less own task. |
| **Also** | A CHECK `("category" IS NULL) = ("ownerId" IS NULL)` — see §2. |
| **SRS ref** | DS-01.3, DS-01.6; SRS §10.2 F-01; Appendix A |

### F-02 — enum `TaskCategory.SBO` → `SBU`

| | |
|---|---|
| **Severity** | Medium |
| **Now** | `enum TaskCategory { SBO, LND }` |
| **After** | `enum TaskCategory { LND, SBU }` |
| **Reason** | The PRD and `UserResource` both say **SBU**. `SBO` is a typo. The value is used in `TaskOwner.kind` and `SprintTask.category`. |
| **Impact** | Prisma emits `ALTER TYPE "TaskCategory" RENAME VALUE 'SBO' TO 'SBU';` — it renames the value in place, so no row is rewritten and no data is lost. This is **not** a `DROP`. |
| **SRS ref** | SRS §10.2 F-02; Appendix A; Appendix B item 2 |

### F-03 — `DsMeeting.createdById` optional, plus `source` / `externalId`

| | |
|---|---|
| **Severity** | Medium |
| **Now** | `createdById String` (required FK to `Pm`), `createdBy Pm @relation(...)` |
| **After** | `createdById String?`, `createdBy Pm? @relation(...)`, plus `source String?`, `externalId String?`, `@@unique([workspaceId, source, externalId])` |
| **Reason** | Scheduling a DS meeting **from the PM page was removed on purpose** (PRD). So a meeting can only arrive from a Teams sync or from seed data — neither of which has a PM behind it. A required `createdById` makes a sync impossible (SRS paper test P-19 fails). `source` + `externalId` let a sync insert a meeting once and not again. |
| **Also** | A CHECK that `teamsLink` is https — see §2. |
| **SRS ref** | SRS §10.2 F-03; DS-08.3, DS-08.4; Appendix A; Appendix B item 3 |

### F-05 — `SprintSubmission` index on `[workspaceId, date]`

| | |
|---|---|
| **Severity** | Low |
| **Now** | `@@unique([userId, date])` only |
| **After** | keep the unique, add `@@index([workspaceId, date])` |
| **Reason** | The PM dashboard counts **today's** submissions across **all users in scope** (FR-PMD-08). The only existing index starts with `userId`, so that count scans every user's rows. The new index makes the dashboard's count a range scan. E04 reads this table (see `HANDOFF.md`). |
| **SRS ref** | SRS §10.2 F-05; Appendix B item 5 |

---

## 2. CHECK constraints (hand-written SQL, end of the migration)

Prisma cannot express these, so they go at the end of the migration's `migration.sql` per
`apps/api/prisma/schema/README.md`. Every one is also a `// DB:` comment in `schema.prisma`.

### F-04 — a sprint week always starts on Monday

```sql
ALTER TABLE "SprintWeek" ADD CONSTRAINT chk_sprintweek_monday
  CHECK (EXTRACT(ISODOW FROM "weekStart") = 1);
```

`weekStart` is currently only a comment. PRD BR-01: a sprint week starts on Monday. The service
also validates this (422 `WEEK_START_NOT_MONDAY`); the constraint is the backstop.

### F-01 — category and owner go together

```sql
ALTER TABLE "SprintTask" ADD CONSTRAINT chk_task_category_iff_owner
  CHECK (("category" IS NULL) = ("ownerId" IS NULL));
```

An own task has neither; an L&D/SBU task has both. This makes "category without owner" and
"owner without category" impossible at the database level.

### F-06 — decide once, consistent reply columns

```sql
ALTER TABLE "SprintTask" ADD CONSTRAINT chk_task_reply_state
  CHECK (
    "verification" IS NULL
    OR ("verification" = 'PENDING' AND "ownerRepliedAt" IS NULL AND "ownerReplyById" IS NULL)
    OR ("verification" IN ('VERIFIED','NOT_CONFIRMED') AND "ownerRepliedAt" IS NOT NULL AND "ownerReplyById" IS NOT NULL)
  );
```

A task with no owner has no verification. A pending task has no reply. A decided task has both the
reply time and the PM who recorded it. This is what "decide once" (PRD NFR-08) means in the data.

### F-10 — the Teams link must be https

```sql
ALTER TABLE "DsMeeting" ADD CONSTRAINT chk_dsmeeting_teamslink_https
  CHECK ("teamsLink" IS NULL OR "teamsLink" ~* '^https://');
```

Currently only a comment. The link is shown in the user's meeting banner, so it must not be able to
carry `javascript:` or `http:`.

---

## 2a. The carry-forward index (Phase 9 hardening)

```sql
CREATE UNIQUE INDEX "SprintTask_carriedFromId_key"
  ON "SprintTask"("carriedFromId")
  WHERE "carriedFromId" IS NOT NULL;
```

**Why.** A carry forward is idempotent (DS-04.4): a task is carried forward at most once. The
service enforced that with a **read** — "which open tasks have no copy yet?" — followed by a write.
That is not atomic. Two requests at the same moment (a double click, two tabs) both read the same
open task, both see no copy, and both insert one. The user gets the task on their board twice.

Only the **database** can decide this, because the decision has to be made at the moment of the
write. The unique index is that decision: the second insert is refused, and the service answers
`200` with the task left out (the first request's copy stands).

**Why partial.** Most tasks are not copies, so `carriedFromId` is `NULL` for all of them. A plain
`UNIQUE` would also work — Postgres treats NULLs as distinct — but the partial form says what the
rule is ("one copy per source task", not "one task in the table") and keeps the index small.

**Why Prisma cannot express it.** Prisma has no partial index. The index is written by hand at the
end of the migration and documented as a `// DB:` comment in `schema.prisma`, the same way the CHECK
constraints are.

**The service side.** `SprintRepository.copyTaskIfNotCarried` writes each copy inside a
**savepoint**, so one refused copy does not undo the copies that already succeeded — without the
savepoint the failed insert would abort the whole transaction. A unique violation is the
idempotency rule working, so it is not an error; any other database failure is left alone and
becomes a 500.

**Rule test.** `db-rule-tests.sql` has a block that inserts a source task, accepts a first copy,
and checks that a second copy of the same source is refused.

---

## 3. Already in the schema — not repeated here

| Constraint | Status |
|---|---|
| `chk_task_planned` — `plannedHours >= 0` | Already in the `init` migration |
| `chk_task_actual` — `actualHours >= 0` | Already in the `init` migration |
| `chk_dscell_author` — exactly one of `authorPmId` / `authorUserId` | Already in the `init` migration (F-11) |
| `chk_dscell_updater` — exactly one of `updatedByPmId` / `updatedByUserId` | Already in the `init` migration (F-11) |
| `chk_dscellver_editor` — exactly one of `editedByPmId` / `editedByUserId` | Already in the `init` migration (F-11) |
| `SprintSubmission` `@@unique([userId, date])` — one sprint per day | Already in the schema |
| `SprintWeek` `@@unique([teamId, weekStart])` | Already in the schema |
| `DsSheetCell` `@@unique([weekId, userId, date, column])` | Already in the schema |

---

## 4. Migration safety notes

| Check | How this change passes it |
|---|---|
| No `ON DELETE CASCADE` | No relation is changed. `DsMeeting.createdBy` keeps `onDelete: Restrict`; only nullability changes. |
| No hidden join table | No relation is added. |
| No `DROP TABLE` / `DROP COLUMN` | The F-02 enum rename is `ALTER TYPE ... RENAME VALUE`, which keeps the value and its rows. |
| At most one migration folder | One folder: `e06_sprint_schema_fixes`. |
| Schema and migrations stay in sync | CI runs `prisma migrate diff` and fails on drift; both the schema and the migration folder are committed together. |
| Applied migrations are immutable | The `init` migration is not touched. A **new** folder is added. |
| Expanding, not destructive | `category` becomes nullable (wider), `createdById` becomes nullable (wider), a new index is added (wider), `source`/`externalId` are new nullable columns. No existing column loses data. |

**Migration order inside the folder** (important for F-01 + F-02 together):

1. `ALTER TYPE "TaskCategory" RENAME VALUE 'SBO' TO 'SBU';`
2. Make `SprintTask.category` nullable.
3. Make `DsMeeting.createdById` nullable.
4. Add `DsMeeting.source`, `DsMeeting.externalId` and the unique index.
5. Add `SprintSubmission` `@@index([workspaceId, date])`.
6. Add the four CHECK constraints last — they reference the new nullable columns.
7. Add the partial unique index on `SprintTask("carriedFromId")` (Phase 9 hardening) — it
   touches no column the checks above created, so its position does not matter.

**Existing rows:** the seven E06 tables are empty in every environment, so no data backfill is
needed. `chk_task_category_iff_owner` and `chk_task_reply_state` would reject a row that has a
category but no owner; no such row exists.

---

## 5. Items requested from the data engineer but **not** changed by E06

The SRS Appendix B message is addressed to the data engineer. The owner decided (2026-11-23) that
E06 applies F-01, F-02, F-03, F-05 and the Appendix-A CHECKs itself. The remaining Appendix B
questions are not E06's to answer, so they are listed in `HANDOFF.md` for E11:

| # | Question | Owner |
|---|---|---|
| B6a | PostgreSQL confirmed? (Yes — Postgres 18 locally, Neon in the cloud.) | E11 |
| B6b | Prisma version? (Yes — pinned to 7.10.1, architecture §9.) | E11 |
| B6c | Keep `TaskVerification` as `VERIFIED` / `NOT_CONFIRMED`? **Yes, kept.** The API maps them to the PRD wording approved / declined (F-07). | E11 |
| B7 | Keep `DsSheetCellVersion`? **Yes, kept** — it is already in the schema and is what makes the conflict dialog (US-68) able to show who changed what. | E11 |
