# Hand-off — Daily Sprint (E06)

What the other squads need from this module, and what this module needs from them.
Written so that nobody has to read the sprint code to integrate with it.

---

## 0. The shared vocabulary — start here

Everything the sprint module answers is described in **one** place, so nobody has to copy a
type by hand:

```
packages/contracts/src/sprint/index.ts
```

The API's own DTO files re-export that file (`dto/sprint-response.dto.ts`,
`dto/pm-sheet-response.dto.ts`), so **the API and the web client cannot drift apart** — there
is one definition, used by both. The class-validator *request* DTOs stay in `apps/api`
(a validation class cannot live in a shared type package), but the **vocabularies** they
validate against come from the contracts (`SPRINT_TASK_CATEGORIES`, `SPRINT_SHEET_COLUMNS`,
`SPRINT_OWNER_DECISIONS`, `SPRINT_REPORT_TYPES`).

| What | Where | Who uses it |
|---|---|---|
| Every answer shape (`SprintTaskView`, `SprintBoardView`, `SprintReportView`, `SprintSheetView`, …) | `packages/contracts/src/sprint/index.ts` | API, web |
| The figure type (`SprintFigure`) and its sources (`SprintSource`) | same | API, web, E08 |
| The outbox event types (`SPRINT_OUTBOX_TYPES`) and the three payloads | same | E01, E08, E09 |
| The port interfaces (`SprintCalendarPort`, `SprintXpLedgerPort`) | same | E07, E09 |
| The web client (`apps/web/src/features/sprint/api.ts`) | `apps/web/src/features/sprint/` | E08's web squad |

**The one rule everybody must not break** (PRD NFR-09): **a missing value is never a zero.**
Every figure is a `SprintFigure`:

```ts
interface SprintFigure {
  value: number | null;          // null = "no data"
  source: 'TASK' | 'SUBMISSION' | 'DERIVED' | 'MISSING';
}
```

A `value` of `0` with a real source is a **real zero**. A `value` of `null` is **no data**. Do
not collapse the two. The web client ships `formatSprintFigure` (which shows a dash for a
missing value) and `isMissingSprintFigure` for exactly this — use them instead of reading
`figure.value` directly.

**The two calendars.** The module has two weeks and they are **not** the same:

| | first day | last day | off days | the client calls |
|---|---|---|---|---|
| the **sprint week** (the PM sheet, P1–P5) | Monday | Sunday | Friday and Saturday | `listSprintWeeks`, `createSprintWeek`, `getSprintSheet` |
| the **report week** (the report window, P6) | Sunday | Friday | **Saturday only** | `getSprintReport` |

A sprint week **always** starts on a Monday — the API answers 422 `WEEK_START_NOT_MONDAY`
otherwise, and the database CHECK `chk_sprintweek_monday` refuses it too. A report week exists
only to say which days a report covers, so **a report window can never move a sprint week**.
The web client never mixes them.

**Org time** is **Asia/Dhaka (UTC+6, no DST)** everywhere. The weekend is **Friday and
Saturday**; **Sunday is a working day**.

---

## 1. For E01 (identity) — the one thing we depend on most

### We need `req.user` populated by the auth guard

Every sprint route reads the caller from `req.user` and from nothing else. The shape we rely on is
the one E01's `JwtAuthGuard` already sets:

```ts
request.user = {
  sub: string,         // Pm.pmId (e.g. "PM001") or User.userId (e.g. "BS23001")
  sid: string,
  workspaceId: string,
  role: 'PM' | 'TRAINEE',
};
```

| We use | For |
|---|---|
| `sub` + `role === 'PM'` | The PM's id. Scope = `User.pmId === sub` and `Team.pmId === sub`. |
| `sub` + `role === 'TRAINEE'` | The user's id. Scope = `User.userId === sub`. |
| `workspaceId` | Every query is filtered by it. |

**Nothing else is ever read.** The sprint routes take the caller from `req.user` and from
nothing else — no `x-dev-user`, no `x-dev-pm`, no `x-actor-*`, no `x-workspace-id`, and no
client-supplied `pmId`/`userId`/`workspaceId` in a body or a query. A `teamId` or a `userId`
in a query is a **key into the caller's own scope**, never authority: the API answers 403
`FORBIDDEN_SCOPE` for a row that is not the caller's. Please keep it that way — the sprint
module's route tests assert that the spoofing headers are ignored.

**`role === 'TRAINEE'` covers all four resource types** — TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT
and SBU. They have identical sprint features (PRD §4), so the sprint module does not branch on
`User.resource`.

**If `req.user` is absent, the sprint routes answer 401.** Until E01's guard is merged, the sprint
module ships with a deny-all resolver provider, so every route answers 401 and nothing is open by
accident. When E01's guard lands, wiring it is a one-line provider change in
`apps/api/src/modules/sprint/sprint.module.ts` — no business logic moves.

**One request:** please keep `sub` as the **login id** (`PM001` / `BS23001`) rather than a uuid.
The sprint module uses it directly against `User.userId` and `Pm.pmId`, and against the
`ownerReplyById` foreign key on `SprintTask`.

### We write notifications (through a port)

`Notification` belongs to E01, so the sprint module does **not** write it. It creates the notice
through a `NotificationPort`, and the local implementation emits an **`OutboxEvent`** of type
**`notification.sprint`** — the sanctioned cross-module channel (architecture §3.3 rule 5).

The event type and the payload shape are shared constants, so you can import them instead of
typing the strings by hand:

```ts
import { SPRINT_OUTBOX_TYPES, type SprintNotificationPayload } from '@bs23/contracts';

SPRINT_OUTBOX_TYPES.notification; // 'notification.sprint'
```

The outbox payload is exactly:

```json
{
  "recipient": { "kind": "PM", "pmId": "PM001" },
  "category": "Sprint awaiting review",
  "title": "The owner answered",
  "message": "…",
  "link": "/pm/sprint"
}
```

| Field | Type | Note |
|---|---|---|
| `recipient` | `{ kind: 'PM'; pmId: string }` **or** `{ kind: 'USER'; userId: string }` | A **discriminated union** — switch on `kind` before reading the id. |
| `category` | `SprintNoticeCategory` | `'Sprint awaiting review'` or `'Sprint verified'`. |
| `title` | `string` | Free text. |
| `message` | `string` | Free text. |
| `link` | `string \| null` | The page to open. **Always present** — `null` when there is none, never omitted. |

| Category | Title | When | Recipient |
|---|---|---|---|
| `"Sprint awaiting review"` | `"A task is waiting for its owner"` | The task owner has not replied for 24 h (the no-reply job) | The user's PM |
| `"Sprint awaiting review"` | `"The owner answered"` | The PM recorded the owner's decision | The PM who recorded it |

**What is emitted today:** the two rows above — both to a **PM**. The port can also notify a
**user** (`{ kind: 'USER', userId }`) and the `"Sprint verified"` category exists, but **nothing
emits them yet**; treat them as reserved, not as traffic to expect.

**Every notice is written inside the transaction of the change it reports.** A rolled-back
decision leaves no notice behind, and a committed decision always leaves one. Please build the
`Notification` row from the payload above — the sprint module does not create it for you.

`Notification.category` is a free string in the schema (F-12). We use exactly the two strings
in `SPRINT_NOTICE_CATEGORIES`, matching PRD FR-NOT-03. Please treat them as shared constants —
the shared constant is `SPRINT_NOTICE_CATEGORIES` in `@bs23/contracts`.

### The owner's answer is recorded once, and you may show it as such

When a PM records the owner's answer, the sprint module writes the decision with a **conditional
update** — `UPDATE … WHERE verification = 'PENDING'` — so the row can only change while it is
still pending. Two PMs pressing the button at the same moment produce exactly **one** decision and
exactly **one** notice; the loser gets `409 ALREADY_DECIDED` and writes nothing.

**This matters for the notification list:** a task can never produce two "The owner answered"
notices. If you ever see one, something is wrong upstream.

### The no-reply job has no HTTP route — it is a method a worker calls

The 24-hour escalation (FR-DS-09) is a plain service method, not an endpoint:

```ts
pmSprintService.runNoReplyCheck(now?: Date): Promise<number>
```

- `now` defaults to the clock; pass it to run the job at a fixed moment (this is how it is tested).
- It returns **how many tasks it escalated**, so a worker can log it.
- It scans **every workspace** that has a stale pending task.
- It **escalates, it never decides**: the task stays `PENDING` and no decision is recorded. It only
  tells the PM.

**Escalate-exactly-once has two guards.** The candidates are picked up with
`FOR UPDATE OF t SKIP LOCKED`, so two concurrent runs work on different rows; and the write is a
conditional update (`pendingAlertSentAt IS NULL`), so a task that was already escalated — by this
run or another — changes no row and gets no second notice. The lock alone is not enough: a crash
between the two would otherwise alert twice.

**The job needs a scheduler.** We ship the method; the worker that calls it on a schedule
(`SPRINT_JOB_CRON`, default hourly) is E01's side of the boundary.

---

## 2. For E04 (PM dashboard)

**FR-PMD-08 — "Sprint completed"**: an active user onboarded today or earlier who has a
`SprintSubmission` for today.

```sql
SELECT COUNT(*)
FROM "SprintSubmission" s
JOIN "User" u ON u."userId" = s."userId"
WHERE s."workspaceId" = $workspaceId
  AND s."date" = $today
  AND u."pmId" = $pmId
  AND u."archivedAt" IS NULL
  AND u."onboardDate" <= $today;
```

**`$today` is the organisation's local day** (Asia/Dhaka, UTC+6, no DST). Use the same helper the
sprint module uses so the two never disagree by a day.

**Index:** F-05 adds `@@index([workspaceId, date])` to `SprintSubmission` for exactly this count.
Before it, the only index started with `userId`, so this count scanned every user's rows.

**Weekend:** on Friday and Saturday the dashboard says "no sprint is expected" (PRD BR-11). The
weekend is **Friday and Saturday** — **Sunday is a working day**.

---

## 3. For E07 (attendance) — the shared working-day rule

PRD FR-ATT-08 asks for **one** shared rule set for "is this a working day". The sprint module needs
it for carry-forward (find the previous working day) and implements it today behind a `CalendarPort`:

```ts
isWorkingDay(workspaceId, day): Promise<boolean>
previousWorkingDay(workspaceId, day): Promise<string>
```

The shape is shared, so you can type against it without copying it:

```ts
import { type SprintCalendarPort } from '@bs23/contracts';
```

Rules:

| Rule | Value | Source |
|---|---|---|
| Weekend | **Friday and Saturday** | PRD BR-02 |
| Public holidays | The `PublicHoliday` table | PRD BR-02 |
| Approved leave | **Not skipped** — an open question in the SRS (DS-04.1) | SRS [Verify] |

When E07 ships the shared rule set, swap the port implementation. The sprint module calls the
port in exactly two places.

---

## 4. For E08 (reports)

**FR-RPT-02** — one of the seven report sections is a Sprint. The data it needs:

| Figure | Table | Filter |
|---|---|---|
| Planned hours, actual hours, tasks done/total, blockers | `SprintTask` | `workspaceId`, `userId` in scope, `date` in the period, `deletedAt IS NULL` |
| Days submitted, days on time | `SprintSubmission` | `workspaceId`, `userId` in scope, `date` in the period |

**Read-only.** E08 reads these tables; the sprint module writes them.

**Use the shared types, do not re-declare them.** The figure type, the source labels and the
report shapes are all in `@bs23/contracts` (see §0):

```ts
import {
  type SprintFigure,        // { value: number | null; source: SprintSource }
  type SprintSource,        // 'TASK' | 'SUBMISSION' | 'DERIVED' | 'MISSING'
  type SprintReportRow,     // one user of a sprint report
  type SprintReportView,    // the whole sprint report
  SPRINT_REPORT_TYPES,      // ['daily', 'weekly', 'biweekly', 'monthly']
} from '@bs23/contracts';
```

**Reporting conventions to copy** (PRD NFR-09, BR-17):

- Every figure carries a **source label**. The labels the sprint module uses are exactly
  **`"TASK"`**, **`"SUBMISSION"`**, **`"DERIVED"`** and **`"MISSING"`** — please use the same
  four strings, so a figure means the same thing in both reports.
- **Missing data is shown as missing, never as zero.** A user who never submitted has no
  "days submitted" value; it is not `0`. The rule is about the **rows**, not the number: a
  user who **has** a task that is worth zero hours has a **real zero** (`source: "TASK"`), and
  a user who submitted late has **zero** on-time days (`source: "SUBMISSION"`).
- Deleted tasks (`deletedAt IS NOT NULL`) never appear in a report.

**The sprint report's own windows** — `GET /pm/sprint/reports?type=&date=&teamId=` (P6) uses
these, and E08's Sprint section should use the same ones so the two never disagree:

| `type` | the days it covers |
|---|---|
| `daily` | the day itself |
| `weekly` | the **report week** that contains the day — **Sunday through Friday**, Saturday excluded |
| `biweekly` | the **two report weeks ending with** that one — Sunday through Friday each, Saturdays excluded (daily ⊂ weekly ⊂ biweekly) |
| `monthly` | the **calendar month** that contains the day |

**The report week is not the sprint week.** The sprint week (P1–P5) runs **Monday to Sunday**
with **Friday and Saturday** off and must keep its Monday `weekStart` (the database CHECK
`chk_sprintweek_monday` refuses anything else). The **report week** runs **Sunday to Friday**
with **only Saturday** off, and it exists only for the report window — so a report window can
never move a sprint week. E08's Sprint section must use the **report week** for the four
windows above and the **sprint week** for anything about a sprint week itself.

Org time is Asia/Dhaka (UTC+6, no DST); the weekend is **Friday and Saturday** and **Sunday
is a working day**.

### We hand you the owner's approval mail

A task with an owner asks that owner to verify it. `MailDelivery` belongs to E08, so the sprint
module does **not** write it directly: it records the request through an `ApprovalMailPort`,
and the local implementation writes an **`OutboxEvent`** of type
**`mail.task_owner_approval`** (`SPRINT_OUTBOX_TYPES.approvalMail`) inside the task's own
transaction — so a rolled-back task leaves no mail behind (DS-02.1).

The payload is exactly:

```json
{
  "sprintTaskId": "…",
  "recipient": "owner@example.com",
  "subject": "…",
  "body": "…",
  "purpose": "TASK_OWNER_APPROVAL"
}
```

The shape is `SprintApprovalMailPayload` in `@bs23/contracts`. `purpose` is always
`"TASK_OWNER_APPROVAL"` — that is the purpose your `MailService` already carries. The mail is
**not sent** by the sprint module; your worker sends it.

### The web client (E08's web squad)

The sprint client already exists and is the one to build the sprint UI on:

```
apps/web/src/features/sprint/api.ts      # the calls
apps/web/src/features/sprint/index.ts    # what the pages import
apps/web/src/features/sprint/README.md   # the rules, in short
```

It already speaks the shared contracts, so it cannot drift from the API:

```ts
import { getSprintReport, formatSprintFigure } from '@/features/sprint';
```

**Its identity rules — do not break them:**

- The token travels in **`Authorization: Bearer <token>`**, and in **nothing else**.
- The client sends **no** `x-dev-user`, `x-dev-pm`, `x-actor-*` or `x-workspace-id` header.
- The client sends **no** client-supplied `pmId`, `userId` or `workspaceId`. A `teamId` or a
  `userId` in a query is a **key into the caller's own scope**, never authority — the API
  answers 403 `FORBIDDEN_SCOPE` for a row that is not the caller's.
- The API answers 401 without a token, 403 for the wrong role, and 403 `FORBIDDEN_SCOPE` for
  a row outside the caller's scope.

**Errors carry the API's own code.** The client throws `SprintApiRequestError`, which keeps
`code` and `status`:

```ts
try {
  await getSprintReport(auth, { type: 'weekly', date: '2026-11-23' });
} catch (error) {
  if (error instanceof SprintApiRequestError && error.code === 'FORBIDDEN_SCOPE') {
    // "not yours" — show it as such.
  }
}
```

The code is what tells **"not yours"** (`FORBIDDEN_SCOPE`) from **"fix the form"**
(`VALIDATION_ERROR`); the message alone does not. The shared error envelope is
`{ error: { code, message } }`.

**The report window is the report week.** `getSprintReport` deals in **report weeks**
(Sunday–Friday); `getSprintSheet` and `listSprintWeeks` deal in **sprint weeks**
(Monday–Sunday). The client keeps the two apart — do not merge them in a page.

---

## 5. For E09 (growth-core)

### We hand you the XP event

An on-time sprint creates an XP event for the user. Because `XpEvent` belongs to E09's schema
section, the sprint module does **not** write it directly. It calls a port:

```ts
interface XpLedgerPort {
  awardOnTimeSprint(tx, input: {
    workspaceId: string; userId: string; day: string; amount: number;
    submissionId: string;
  }): Promise<void>;
}
```

The shape without the transaction handle is shared, so you can type your own adapter against
it without copying it:

```ts
import { type SprintXpLedgerPort } from '@bs23/contracts';
```

The local implementation writes an `OutboxEvent` in the same transaction as the `SprintSubmission`.
**When your real ledger service exists, swap the port implementation** — the sprint module's
business logic does not change.

What the sprint module provides:

| Field | Value |
|---|---|
| `amount` | `XpRule.onTimeSprint` (default 20) |
| `day` | The org-local day of the submission |
| `source` | `ON_TIME_SPRINT` |
| `status` | `PENDING` — pending until a PM reviews it (PRD BR-14) |
| `key` | `"sprint:<userId>:<date>"` — unique per workspace, so a retry cannot double-count |
| `submissionId` | The `SprintSubmission` the award belongs to |

**The award is written only for an on-time submission.** A late one records no event at all.

**The outbox event type is `xp.sprint_on_time`** (`SPRINT_OUTBOX_TYPES.xpOnTimeSprint`). The
payload is exactly:

```json
{
  "userId": "BS23001",
  "day": "2026-11-23",
  "amount": 20,
  "submissionId": "…",
  "source": "ON_TIME_SPRINT",
  "key": "sprint:BS23001:2026-11-23"
}
```

The shape is `SprintXpAwardPayload` in `@bs23/contracts`. `key` is the idempotency key —
`"sprint:<userId>:<day>"` — so a retry cannot double-count. `day` is the org-local day
(`'YYYY-MM-DD'`).

**One award per submission.** The award and the submission are written in **one transaction**,
so a rolled-back submission awards no XP and a committed one always does.

**Cutoff:** `XpRule.sprintCutoff` (`"HH:MM"`, default `"10:00"`). The sprint module **reads** it
from `XpRule` at submit time and freezes the result in `SprintSubmission.onTime`. Changing the
cutoff later never changes an old submission (PRD BR-05).

### We satisfy your `SprintSourcePort`

Your `growth-core/ports/sprint-source.port.ts` expects:

```ts
interface SprintSourcePort {
  submissionsOf(db, userId): Promise<{ day: string; onTime: boolean }[]>;
}
```

The sprint module exposes exactly that shape from `SprintSubmission`
(`day` = `'YYYY-MM-DD'` org-local day, `onTime` = the frozen flag). Your streak code can read it
without any change on your side.

**Day strings:** ours are `'YYYY-MM-DD'`, matching your `DayString` type. Same timezone
(Asia/Dhaka, UTC+6, no DST) and the same weekend (Friday and Saturday, Sunday is a working day) —
your `org-time.ts` and ours are written to agree.

**Streak freezes:** approved leave and public holidays freeze a streak (PRD BR-15). Those come from
E07, not from us. Note that a **Friday or Saturday** is also outside a sprint week that runs
Monday→Sunday, and Sunday is inside it.

---

## 6. For E02 (directory)

**FR-DIR-11 — the "Sprint & recent work" tab** on a user profile.

| Figure | Table | Filter |
|---|---|---|
| Recent tasks | `SprintTask` | `userId`, `deletedAt IS NULL`, most recent `date` first |
| Recent submissions | `SprintSubmission` | `userId`, most recent `date` first |

Both are keyed by `userId` (`BS23001`), which is the profile's own key — no join is needed.

**Planned hours vs. actual hours:** both columns exist on `SprintTask`
(`plannedHours Decimal(4,1)`, `actualHours Decimal(4,1)`). A profile showing "hours worked" should
use `actualHours`.

**We read `Team` and `Membership` (Phase 6).** The PM's team sheet shows one row per member of
the team, so the sprint module reads `Membership` (with `leftAt`, so a member who left mid-week
only has rows for the days they were there) and `Team` (with `pmId`, to decide whose team it
is). These are **reads only** — the sprint module writes nothing to either table, and a
membership that changes shows up on the sheet the next time it is asked for.

---

## 7. What we need from nobody, and what we changed for everyone

### The schema changes we made (E06 section only)

See `SCHEMA-CHANGES.md` for the full list. In summary:

| Change | Who is affected |
|---|---|
| `TaskCategory.SBO` → `SBU` | Anyone reading `TaskCategory`. The value is renamed in place; no rows change meaning. |
| `SprintTask.category` is now nullable | Only E06 writes this table. |
| `DsMeeting.createdById` is now nullable, plus `source` / `externalId` | Only E06 writes this table. |
| `SprintSubmission` gains `@@index([workspaceId, date])` | E04's dashboard count gets faster. No behaviour change. |
| Four new CHECK constraints | Only E06 writes these tables. |
| `SprintTask` gains a **partial unique index** on `("carriedFromId")` | Only E06 writes this table. A task is carried forward at most once; the index is what decides it under concurrency. |

### The migration

One migration folder, `e06_sprint_schema_fixes`, added alongside the `init` migration. The `init`
migration is untouched. If another migration reaches `develop` first, regenerate ours the way the
schema README describes (delete our unmerged folder, rebase, `pnpm db:migrate --name ...`).

### The sprint demo data

`apps/api/prisma/seed/seed.sprint.ts`, run with `pnpm db:seed:sprint` from the repo root, **after**
`pnpm db:seed` has run. It is a separate script from E11's `seed.ts` and **creates nothing but
sprint rows** — no user, no PM, no team, no credential.

It is **idempotent**: re-running it updates the rows instead of adding a second set, so it is safe
in CI and in a demo environment that is reset often. It refuses to run against a non-local
database unless `ALLOW_REMOTE_SEED=true` is set.

What it creates: 3 task owners, 3 sprint weeks (each a **Monday**), tasks and submissions for the
trainees **PM001 manages**, one stored `PLAN` cell and one DS meeting. The demo keeps the two
calendars apart: the **sprint week** is Monday→Sunday and the **report week** is Sunday→Friday,
and no task sits on a Friday or a Saturday.

---

## 8. Where our things are

| What | Where |
|---|---|
| Module code | `apps/api/src/modules/sprint/` |
| **Shared types (the whole vocabulary)** | `packages/contracts/src/sprint/index.ts` |
| The API's re-exports of those types | `apps/api/src/modules/sprint/dto/sprint-response.dto.ts`, `dto/pm-sheet-response.dto.ts` |
| The web client | `apps/web/src/features/sprint/api.ts` (and `index.ts`, `README.md`) |
| Schema section | `apps/api/prisma/schema/schema.prisma`, the `E06 · sprint` section |
| Migration | `apps/api/prisma/migrations/*_e06_sprint_schema_fixes/` |
| Sprint seed data | `apps/api/prisma/seed/seed.sprint.ts` (separate from E11's `seed.ts`) |
| Decisions and defaults | `apps/api/src/modules/sprint/ASSUMPTIONS.md` |
| Endpoint inventory | `apps/api/src/modules/sprint/API-MAPPING.md` |
| Schema change record | `apps/api/src/modules/sprint/SCHEMA-CHANGES.md` |

### The cross-module traffic, in one table

Architecture §3.3 rule 5: a module may **read** another module's tables but must not **write**
them. Every write below goes through a port, and every port writes an `OutboxEvent`.

| We write | Table it belongs to | How | Event type | Owner |
|---|---|---|---|---|
| `Notification` | E01 | `NotificationPort` | `notification.sprint` | E01 |
| `MailDelivery` | E08 | `ApprovalMailPort` | `mail.task_owner_approval` | E08 |
| `XpEvent` | E09 | `XpLedgerPort` | `xp.sprint_on_time` | E09 |

And the reads we make (reads are always allowed):

| We read | Table | Belongs to | For |
|---|---|---|---|
| `User` (`userId`, `pmId`, `archivedAt`, `onboardDate`) | E01/E02 | scope and the report rows |
| `Team` (`pmId`) | E02 | "is this the PM's team?" |
| `Membership` (`leftAt`) | E02 | the sheet's rows for the days a member was there |
| `PublicHoliday` (`date`) | E07 | the working-day rule |
| `XpRule` (`onTimeSprint`, `sprintCutoff`) | E09 | the XP amount and the on-time cutoff |
| `DsMeeting` (`date`, `time`, `teamsLink`) | E06 | the meeting banner |

**The event types are shared constants** — import them rather than typing the strings:

```ts
import { SPRINT_OUTBOX_TYPES } from '@bs23/contracts';
// SPRINT_OUTBOX_TYPES.notification   -> 'notification.sprint'
// SPRINT_OUTBOX_TYPES.approvalMail   -> 'mail.task_owner_approval'
// SPRINT_OUTBOX_TYPES.xpOnTimeSprint -> 'xp.sprint_on_time'
```
