# API mapping — Daily Sprint (E06)

The Build Order (Phase 0, step 0.2) asks us to "list every sprint-related function in
`src/lib/api.ts` with its inputs and outputs. One function becomes one endpoint."

**`src/lib/api.ts` does not exist in this repository.** There is no front-end mock store here — the
web app has one README per feature folder and no code. The equivalent source of truth is therefore
the SRS endpoint tables (§5.3 user endpoints, §5.4 PM endpoints) reconciled with the Prisma schema.

This document is that inventory, plus the mapping from each endpoint to the service method, the
tables it touches and the Build Order test IDs that cover it.

**Base path:** none. `src/main.ts` sets no global prefix, so routes are mounted bare, matching
`/health/live`. A global prefix is E11's decision (see ASSUMPTIONS A9).

**Envelope:** success returns the resource directly (Nest's default); lists that paginate return
`{ data, meta: { nextCursor } }`. Errors return `{ error: { code, message, details? } }` — the same
shape E09's `GrowthErrorFilter` produces, so it can be swapped for E01's shared format later (A13).

**Auth:** every route below requires `req.user`. Missing → 401. The routes run E01's
`JwtAuthGuard` (which sets `req.user`), then the sprint module's own actor guard, then E01's
`RolesGuard`. Identity is never read from a header, a query or a body. See ASSUMPTIONS §3.

---

## 1. User endpoints — `/sprint/*`

Role: the signed-in user (any of the four resource types).

| # | Method + path | SRS | Request | Success | Errors | Service method | Tables |
|---|---|---|---|---|---|---|---|
| U1 | `GET /sprint/task-owners?kind=` | §5.3 | `kind` ∈ `LND` \| `SBU` | 200 list of active owners | 401, 403, 422 | `SprintService.listTaskOwners` | `TaskOwner` |
| U2 | `GET /sprint/board?date=` | §5.3 | `date` (default today) | 200 `{ date, tasks, carryCandidates }` | 401, 403, 422 | `SprintService.getBoard` | `SprintTask`, `PublicHoliday` |
| U3 | `POST /sprint/tasks` | §5.3 | `title`, `description`, `date`, `plannedHours`, `actualHours?`, `blocker?`, `category?`, `ownerId?` | 201 task | 401, 403, 422 `OWNER_INACTIVE` / `CATEGORY_OWNER_MISMATCH` / `VALIDATION_ERROR` / `USER_ARCHIVED` | `SprintService.createTask` | `SprintTask`, `TaskOwner`, `OutboxEvent` |
| U4 | `PATCH /sprint/tasks/:id` | §5.3 | any of `title`, `description`, `plannedHours`, `actualHours`, `blocker`, `done` | 200 task | 401, 403, 404, 422 | `SprintService.updateTask` | `SprintTask` |
| U5 | `DELETE /sprint/tasks/:id` | §5.3 | none | 204 | 401, 403, 404 | `SprintService.deleteTask` | `SprintTask` (soft) |
| U6 | `POST /sprint/carry-forward` | §5.3 | `date` | 200 `{ carried: [...] }` | 401, 403, 422 | `SprintService.carryForward` | `SprintTask`, `PublicHoliday` |
| U7 | `POST /sprint/submit` | §5.3 | none (no body, no day, no user) | 201 `{ date, submittedAt, onTime, xpAwarded }` | 401, 403, 409 `ALREADY_SUBMITTED`, 422 `USER_ARCHIVED` | `SprintService.submitSprint` | `SprintSubmission`, `XpRule`, `OutboxEvent` |
| U8 | `GET /sprint/summary` | §5.3 | none | 200 `{ from, to, days }` — 14 org days | 401, 403 | `SprintService.getSummary` | `SprintTask`, `SprintSubmission` |
| U9 | `GET /sprint/history?cursor=&limit=` | §5.3 | `cursor`, `limit` (default 20, max 100) | 200 `{ data, meta: { nextCursor } }` | 401, 403, 422 | `SprintService.getHistory` | `SprintSubmission`, `SprintTask` |
| U10 | `GET /sprint/meeting` | §5.3 | none | 200 `{ meeting }` — `meeting` is `null` when there is none | 401, 403 | `SprintService.getMeetingBanner` | `DsMeeting`, `Membership` |

**Status codes.** A failed DTO answers **422** `VALIDATION_ERROR`, not Nest's 400: the SRS §9
lists it as a 422, and the request was understood — a rule refused it. A missing token answers
**401** `UNAUTHENTICATED`, the wrong role **403** `FORBIDDEN`, a task that is not the caller's
**404** `NOT_FOUND`. Every one of them uses the same `{ error: { code, message, details? } }`
envelope, including the errors Nest and E01's guards raise before any sprint code runs.

**`GET /sprint/meeting` returns an object, not a bare `null`.** Nest serialises a bare `null`
return as an empty body `{}`, so the banner is wrapped: `{ meeting: {...} | null }`. The client
reads `meeting` and renders nothing when it is `null`.

**`POST /sprint/submit` takes no body.** The day is the org-local today and the user is the
signed-in one; a `date` or a `userId` in the body is ignored. A second submit on the same day
answers **409** `ALREADY_SUBMITTED` — the unique index on `[userId, date]` is what refuses it,
and that refusal is turned into a conflict rather than a 500. The `onTime` flag is **frozen**
into the row at submit time, so changing the workspace cutoff later never changes an old
submission. An on-time submission also writes an XP outbox event, in the same transaction.

**`POST /sprint/carry-forward` carries a task at most once.** The `date` is the day the tasks
are carried **to**; the source is the **previous working day** (Friday and Saturday are the
weekend, and Sunday is a working day). A task is carried forward **once**: the unique index on
`SprintTask("carriedFromId")` is what decides it, because only the database can decide at the
moment of the write. Two requests at the same moment (a double click, two tabs) both read the
same open task; the index refuses the second copy and that task is simply left out of that
answer — the first request's copy stands. The answer is still **200** with `carried`: the
idempotency rule working is not an error.



## 2. PM endpoints — `/pm/sprint/*`

Role: PM. Every route is scoped by `User.pmId` / `Team.pmId`.

| # | Method + path | SRS | Request | Success | Errors | Service method | Tables |
|---|---|---|---|---|---|---|---|
| P1 | `GET /pm/sprint/weeks?teamId=` | §5.4 | `teamId` | 200 list | 401, 403 `FORBIDDEN_SCOPE`, 422 | `PmSheetService.listWeeks` | `SprintWeek`, `Team` |
| P2 | `POST /pm/sprint/weeks` | §5.4 | `teamId`, `weekStart` | 201 week | 401, 403 `FORBIDDEN_SCOPE`, 409 `WEEK_EXISTS`, 422 `WEEK_START_NOT_MONDAY` | `PmSheetService.addSprintWeek` | `SprintWeek`, `Team` |
| P3 | `GET /pm/sprint/weeks/:id/sheet` | §5.4 | none | 200 grid | 401, 403 `FORBIDDEN_SCOPE`, 404 | `PmSheetService.getSheet` | `SprintWeek`, `DsSheetCell`, `SprintTask`, `Membership` |
| P4 | `PUT /pm/sprint/cells` | §5.4 | `weekId`, `userId`, `date`, `column`, `value`, `expectedVersion` | 200 `{ version }` | 401, 403 `FORBIDDEN_SCOPE`, 409 `CELL_CONFLICT`, 422 | `PmSheetService.saveCell` | `DsSheetCell`, `DsSheetCellVersion` |
| P5 | `GET /pm/sprint/weeks/:id/export` | §5.4 | none | 200 XLSX | 401, 403 `FORBIDDEN_SCOPE`, 404 | `PmSheetService.getSheetForExport` | same as P3 (ExcelJS) |
| P6 | `GET /pm/sprint/reports?type=&date=&teamId=` | §5.4 | `type` ∈ `daily`\|`weekly`\|`biweekly`\|`monthly`, `date`, `teamId?` | 200 rows with source labels | 401, 403 `FORBIDDEN_SCOPE`, 422 | `PmReportsService.getReports` | `SprintTask`, `SprintSubmission`, `User`, `Membership`, `Team` |
| P7 | `POST /pm/sprint/tasks/:id/owner-reply` | §5.4 | `{ decision: "VERIFIED" \| "NOT_CONFIRMED" }` | 200 task | 401, 403 `FORBIDDEN_SCOPE`, 404, 409 `ALREADY_DECIDED`, 422 `VALIDATION_ERROR` | `PmSprintService.recordOwnerReply` | `SprintTask`, `Notification` |

**P1–P5 are the team sheet.** They are one feature: P1 and P2 open the week, P3 shows it,
P4 edits a cell of it and P5 downloads it. The scope of all five is the same — the team the
signed-in PM manages.

**The scope is decided from the row, not from the client.** Every one of these routes takes
`req.user` and reads the PM id out of it (E01 contract §3). The `teamId` in the query, the
`weekId` in the body and the `userId` of the cell are *keys*, not *authority*: they say **which**
row, never **whose** row it is. A team that another PM manages answers **403** `FORBIDDEN_SCOPE`
and **nothing is read and nothing is written**. A `pmId` in the body is ignored.

**P2 — a week starts on a Monday, and only once.** The service checks the day of the week
itself and answers **422** `WEEK_START_NOT_MONDAY` for any other day; the database checks it
again with `chk_sprintweek_monday`, so a row that is not a Monday cannot exist even if some
other code path wrote one. The same team and the same Monday are refused with **409**
`WEEK_EXISTS` — the unique index `SprintWeek_teamId_weekStart_key` is what refuses it, and
that refusal is turned into a conflict rather than a 500.

**P3 — every cell says where its value came from.** A cell carries `source`:
`DERIVED` (the value was computed from the tasks), `STORED` (a PM typed it) or `EMPTY` (there
is nothing). The sheet never shows a missing value as a zero (PRD NFR-09): an empty cell is
`EMPTY`, not `0`. The five columns are `YESTERDAY`, `HOURS`, `TODAY`, `BLOCKERS` and `PLAN`.
`PLAN` is **never** derived (OQ-2) — only a PM writes it. The grid is one row per member and
seven days per row, Monday to Sunday; Friday and Saturday carry `weekend: true` and **Sunday
is a working day** (Asia/Dhaka, UTC+6, no DST). Monday's `YESTERDAY` column is read from the
**Sunday before** the week.

**P4 — the edit is a lock, not a save.** The client sends the `expectedVersion` it saw. The
write is a conditional `UPDATE … WHERE id = ? AND version = ?`, so a cell somebody else changed
in the meantime is **not** overwritten: the answer is **409** `CELL_CONFLICT` with
`details: { expectedVersion, currentVersion, currentValue }`, which is what the conflict
dialog (US-68) shows. The old value is written to `DsSheetCellVersion` in the same
transaction, so the history and the cell can never disagree. A first edit sends
`expectedVersion: 0`; a non-zero version for a cell that does not exist yet is a conflict
too, not a silent create. The `date` must be **inside the week** the cell is saved against
(Monday to Sunday) — a day outside it is **422** `VALIDATION_ERROR`, because the sheet renders
exactly the seven days of the week and such a cell would never be shown again.

**P5 — the export is a file, not the JSON envelope.** The route answers the workbook itself:
`Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and a
`Content-Disposition` attachment. The file is built on the backend with ExcelJS (OQ-11). The
layout is a day block of five columns per member: the title carries the team and the week, and
there is one row per member **per day** — a member who works all seven days has seven rows, so
the file prints the way the sheet is read.

**P6 — the report is one row per user, and every number says where it came from.** The
`type` says which period, and the `date` says which day that period is about:

| `type` | the days it covers |
|---|---|
| `daily` | the day itself |
| `weekly` | the **report week** that contains the day — **Sunday through Friday**, Saturday excluded (ASSUMPTIONS L13) |
| `biweekly` | the **two report weeks ending with** that one — Sunday through Friday each, Saturdays excluded — so the windows nest: daily ⊂ weekly ⊂ biweekly |
| `monthly` | the **calendar month** that contains the day — a month is not a report week, so it is not a number of weeks |

**The report week is not the sprint week.** The two calendars are different and live side by
side:

| | first day | last day | off days |
|---|---|---|---|
| the **sprint week** (P1–P5) | Monday | Sunday | Friday and Saturday |
| the **report week** (P6) | **Sunday** | **Friday** | **Saturday only** |

A report week therefore covers six **active** days, and Saturday is the gap between one report
week and the next. The sprint week is **untouched**: `SprintWeek.weekStart` is still a Monday
and the database still refuses a week that does not start on one (CHECK
`chk_sprintweek_monday`), so a report window can never move a sprint week.

**Every figure carries a source**, and there are exactly four: `TASK` (from `SprintTask`),
`SUBMISSION` (from `SprintSubmission`), `DERIVED` (worked out) and `MISSING` (there is
nothing). **A missing value is never shown as a zero** (PRD NFR-09, ASSUMPTIONS E8). The rule
is about the **rows**, not about the number: a user with **no** task in the window has no
planned hours, no actual hours and no task count — all three are `MISSING`. A user who **did**
have a task that is worth zero hours has a **real zero** with `source: 'TASK'`. The same holds
for the submissions: a user who never submitted has **missing** days submitted, while a user
who submitted late has **zero** on-time days with `source: 'SUBMISSION'`.

**The scope is the PM's own people.** Without a `teamId` the report covers every user the PM
manages (`User.pmId = pmId`, archived users left out). With a `teamId` it covers the members
of that team **that the PM manages** — a member another PM manages is left out even though
they are in the team (ASSUMPTIONS D8). A member who **left before** the window is left out;
a member who left **inside** it stays, and their row shows the figures as missing.

**`teamId` is a key, not authority.** The team is looked up and its PM compared with the
signed-in PM, exactly like P1–P5: a team of another PM — and a team that does not exist —
answer **403 `FORBIDDEN_SCOPE`**, and **nothing is read**. The `date`, the `type` and the
`teamId` say **which** report, never **whose**.

**P7 — the reply is decided once.** The endpoint takes the decision and the task id, and
nothing else: the PM who records it is the one who is signed in, and the user's id is never
taken from the client. The write is a **conditional** update — the row changes only while it
is still `PENDING` — so two presses of the button, or two PMs at the same moment, produce
exactly one decision. The second attempt changes no row and answers **409**
`ALREADY_DECIDED`; it never overwrites the decision that was already made.

**The scope.** The task is read together with the PM who manages its user. A task of
somebody else's user answers **403** `FORBIDDEN_SCOPE` and **nothing is written** — no
decision and no notice. A task that needs no verification (one done for oneself, with no
owner) answers **404**: there is no owner to answer.

**The notice is inside the transaction.** The PM is told about the answer in the same
transaction that records it, so a rolled back answer leaves no notice behind. The notice
goes through the `NotificationPort`; the local implementation writes an `OutboxEvent`.

## 3. System — the no-reply job

| # | Trigger | SRS | Does | Tables |
|---|---|---|---|---|
| S1 | Scheduled (`SPRINT_JOB_CRON`, default hourly) and callable directly as `runNoReplyCheck(now)` for tests | FR-DS-09 / DS-09.1–09.3 | Finds `PENDING` tasks with `ownerRequestedAt <= now - 24h`, `pendingAlertSentAt IS NULL`, `deletedAt IS NULL`. Per task, in one transaction: creates a PM `Notification` and sets `pendingAlertSentAt`. Uses `FOR UPDATE SKIP LOCKED` so two runs never alert twice. | `SprintTask`, `Notification` |

**S1 — the job escalates, it never decides.** A task whose owner has not answered for a day
is reported to the PM; the task stays `PENDING` and no decision is recorded. The job only
**tells** the PM.

**The job never tells the PM twice.** Two things guard it. The rows are picked up with
`FOR UPDATE SKIP LOCKED`, so two runs at the same time work on different rows; and the write
is a conditional `updateMany` (`pendingAlertSentAt IS NULL`), so a task that was already
escalated — by this run or by another — changes no row and gets no second notice.

**There is no HTTP route for the job.** It runs on a schedule and is called by the worker;
it is not a request anybody can make. It is exposed as a plain method,
`runNoReplyCheck(now)`, so a worker can call it and a test can run it at a fixed moment.

---

## 4. Functional requirements → endpoints

| FR | Requirement | Endpoints |
|---|---|---|
| FR-DS-01 | Board and task creation | U1, U2, U3 |
| FR-DS-02 | Owner verification | U3 (mail queued), P7, S1 |

| FR-DS-03 | Submit sprint | U7 (`POST /sprint/submit`) |
| FR-DS-04 | Carry forward, summary, history, delete | U2, U5, U6, U8, U9 |
| FR-DS-05 | Blockers visible to the PM | P3 (BLOCKERS column), P6 |
| FR-DS-06 | Team sheet | P1, P2, P3, P4, P5 |
| FR-DS-07 | Sprint reports | P6 |
| FR-DS-08 | Meeting banner | U10 |
| FR-DS-09 | "No reply after a day" job | S1 |

## 5. User stories → acceptance criteria

| Story | Acceptance criterion (PRD §7) | Covered by |
|---|---|---|
| US-63 | Task joins the sprint with status "Awaiting approval" | U3 (T-01…T-06) |
| US-64 | PM's notification list shows the outcome; the reply can be recorded once, only for the PM's own users | P7, S1 (T-07…T-12) |
| US-65 | Submission stored with its time and the on-time flag | U7 (T-13…T-18) |
| US-66 | Two-week summary and History by date; "Delete task?" before delete | U5, U8, U9 (T-19…T-24) |
| US-67 | Blocker text visible in the PM's sprint view | P3, P6 (T-25) |
| US-68 | Conflict dialog before overwriting another editor's cell | P4 (T-26…T-33) |
| US-69 | Every report option shows hours and blockers per user | P6 (T-34…T-36) |
| US-70 | Banner shows the meeting's title, day and time | U10 (T-37…T-39) |

## 6. Endpoints deliberately **not** built

| Endpoint | Why not |
|---|---|
| `POST /pm/sprint/meetings` (schedule a DS meeting) | **Removed on purpose by the PRD.** Meetings come from a Teams sync or seed data. `DsMeeting.createdById` is made optional (F-03) so a sync can insert one. |
| Any endpoint with planned start/end on a sprint task | **Removed on purpose by the PRD.** The schema has no such column. |
| A "waiting for you" strip endpoint | **Decided against** by the PRD. Not a sprint concern. |
| `DELETE /pm/sprint/cells` | Not required. A cell edit is an overwrite; the PRD has no cell-delete story. |
| `POST /pm/sprint/tasks/:id/owner-reply` by a task owner | In v1 the task owner does not sign in; the PM records the reply on their behalf (P7). A real email reply is Phase 4 of the release plan. |
| An HTTP route for the no-reply job | The job runs on a schedule, not on a request. It is a plain method, `runNoReplyCheck(now)`, that a worker calls. |

## 7. Cross-module reads this module makes

Reading another module's table is allowed (architecture §3.3 rule 5). This module **reads**:

| Table | Owner | Used for |
|---|---|---|
| `User` | E01 | Scope check (`pmId`), `archivedAt`, `resource`; the rows of a report |
| `Pm` | E01 | Scope check (`pmId` of the caller) |
| `Team` | E02 | Sheet scope (`Team.pmId`), team name; the scope check of a report |
| `Membership` | E02 | Sheet rows, meeting banner; the members of a team report |
| `Notification` | E01 | PM alerts (written through a port) |
| `OutboxEvent` | E01 | Cross-module hand-off for XP and mail (written through a port) |
| `XpRule` | E09 | `sprintCutoff`, `onTimeSprint` |
| `PublicHoliday` | E07 | Working-day rule |

This module **does not write** to any of those tables except `OutboxEvent`, which is the sanctioned
cross-module channel.
