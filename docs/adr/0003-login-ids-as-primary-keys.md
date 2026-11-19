# ADR 0003: Login IDs as Primary Keys for Pm and User

| Field | Value |
|---|---|
| Status | **Accepted** |
| Date | 2026-11-19 |
| Author | E11 (DevOps) |
| Deciders | E11, E01 (identity), E02 (directory) |
| Related | PRD v1 Q10 (user ID format), PR #12 (`init` migration), [ADR 0001](0001-monorepo-structure.md) |

## 1. Context

The v1 schema has two separate login tables:

- `Pm` for PMs (admins), primary key `pmId`, e.g. `PM002`
- `User` for the 4 resource types (TRAINEE, CENTRAL_LND, INDUSTRIAL_ATTACHMENT, SBU), primary key
  `userId`, e.g. `BS23001`

There is no role enum. Which table a person is in decides whether they are a PM or a user.

These IDs are used as foreign keys in more than 30 tables (`userId` points to `User.userId`;
`pmId` and every `...ById` column point to `Pm.pmId`).

The usual alternative is a hidden internal key (`id String @id @default(uuid())`) plus a separate
`@unique` code column. That makes an ID change a one-row update instead of a change in 30+ tables.

## 2. Decision

We keep the login IDs as primary keys (already in the `init` migration).

This is only safe if the IDs never change. The application, not the database, must keep these rules:

1. **An ID never changes.** There is no API, admin screen or script that updates `Pm.pmId` or
   `User.userId`. A typo in an ID is fixed by creating a new record, not by editing the ID.
2. **An ID is never reused.** A user who leaves keeps their row (`archivedAt` is set). Their ID is
   not given to anyone else, even years later.
3. **An ID is unique across the whole system**, not only inside one workspace. `PM002` and
   `BS23001` are global.
4. **The format is fixed for v1:** PMs `PM` + number, users `BS23` + number. A new format needs a
   new ADR.
5. **One email belongs to one person.** The same email cannot exist in both `Pm` and `User`
   (enforced by the triggers `trg_pm_email` and `trg_user_email` in the `init` migration).

## 3. Consequences

**Good**

- Simple joins and readable data: a row in `Attendance` shows `BS23001`, not a uuid.
- No extra lookup from login code to internal ID.

**Bad**

- If an ID ever has to change, it is a large migration touching 30+ tables. Rule 1 exists to avoid it.
- The database cannot stop ID reuse (rule 2); only code review can.

## 4. What each owner must do

| Owner | Action |
|---|---|
| E01 (identity) | Login looks up `Pm` by `pmId` and `User` by `userId` (or by email in both tables). No ID-change endpoint. |
| E02 (directory) | Creating a user generates the next free ID and never reuses an archived one. Editing a user never edits `userId`. |
| E11 (reviewer) | Reject any PR that updates `pmId` / `userId` or adds an ID-change path. |

## 5. Other v1 schema decisions recorded on the same day

- No `CourseVersion` table in v1. A topic (`CourseModule`) belongs directly to a `Course`.
- No `TECHNICAL` badge kind in v1. `BadgeAward.attemptId`, `projectUrl` and `projectReviewed`
  stay in the table, unused, for a later version.
- `TRAINEE` is a resource type of `User` (`UserResource`), not a login role.
