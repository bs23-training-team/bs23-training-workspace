-- E06 · sprint · schema fixes for the Daily Sprint module.
--
-- Closes the five gaps the SRS conformance review found between the schema and PRD v1
-- (SRS section 10.2): F-01, F-02, F-03, F-05, plus the CHECK constraints the review
-- listed in Appendix A (F-04, F-01, F-06, F-10).
--
-- Only the E06 section of the schema changes. Nothing is dropped, nothing is deleted:
-- every change makes a column wider, adds a column, adds an index or adds a constraint.
-- See apps/api/src/modules/sprint/SCHEMA-CHANGES.md for the full reasoning.

-- ---------------------------------------------------------------------------
-- F-02: the enum value SBO is a typo for SBU (PRD and UserResource both say SBU).
--
-- Postgres renames the value in place, so the type and its rows are untouched.
-- (Prisma's own generated SQL would rebuild the type and DROP the old one; this is
-- the narrower change.)
-- ---------------------------------------------------------------------------
ALTER TYPE "TaskCategory" RENAME VALUE 'SBO' TO 'SBU';

-- ---------------------------------------------------------------------------
-- F-01: a task done for oneself has neither a category nor an owner, so the
-- category column has to be optional.
-- ---------------------------------------------------------------------------
ALTER TABLE "SprintTask" ALTER COLUMN "category" DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- F-03: scheduling a DS meeting from the PM page was removed on purpose, so a
-- meeting can only arrive from a Teams sync or from seed data. Neither has a PM
-- behind it, so createdById is optional now. source/externalId let a sync insert
-- a meeting once and not again.
-- ---------------------------------------------------------------------------
ALTER TABLE "DsMeeting" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "DsMeeting" ADD COLUMN "source" TEXT;
ALTER TABLE "DsMeeting" ADD COLUMN "externalId" TEXT;

CREATE UNIQUE INDEX "DsMeeting_workspaceId_source_externalId_key" ON "DsMeeting"("workspaceId", "source", "externalId");

-- ---------------------------------------------------------------------------
-- F-05: the PM dashboard counts today's submissions across all users in scope
-- (FR-PMD-08). The only index started with userId, so that count scanned every
-- user's rows.
-- ---------------------------------------------------------------------------
CREATE INDEX "SprintSubmission_workspaceId_date_idx" ON "SprintSubmission"("workspaceId", "date");

-- ---------------------------------------------------------------------------
-- Appendix A: the rules Prisma cannot express. Each one is also a `// DB:` comment
-- in schema.prisma. They come last, because they reference the columns changed above.
-- ---------------------------------------------------------------------------

-- F-04: a sprint week always starts on Monday (PRD BR-01).
ALTER TABLE "SprintWeek"
  ADD CONSTRAINT chk_sprintweek_monday
  CHECK (EXTRACT(ISODOW FROM "weekStart") = 1);

-- F-01: category and owner go together. A task for oneself has neither;
-- a task for an L&D team or SBU has both.
ALTER TABLE "SprintTask"
  ADD CONSTRAINT chk_task_category_iff_owner
  CHECK (("category" IS NULL) = ("ownerId" IS NULL));

-- F-06: decide once (PRD NFR-08). A task with no owner has no verification.
-- A pending task has no reply yet. A decided task has both the reply time and
-- the PM who recorded it.
ALTER TABLE "SprintTask"
  ADD CONSTRAINT chk_task_reply_state
  CHECK (
    "verification" IS NULL
    OR ("verification" = 'PENDING' AND "ownerRepliedAt" IS NULL AND "ownerReplyById" IS NULL)
    OR ("verification" IN ('VERIFIED','NOT_CONFIRMED') AND "ownerRepliedAt" IS NOT NULL AND "ownerReplyById" IS NOT NULL)
  );

-- F-10: the Teams link is shown in the user's meeting banner, so it must be https.
ALTER TABLE "DsMeeting"
  ADD CONSTRAINT chk_dsmeeting_teamslink_https
  CHECK ("teamsLink" IS NULL OR "teamsLink" ~* '^https://');

-- ---------------------------------------------------------------------------
-- Carry forward is idempotent (DS-04.4, PRD BR-05): a task is carried forward at
-- most once. The service asks the database for the candidates and copies them,
-- but a read followed by a write is not atomic: two requests at the same moment
-- (a double click, two tabs) both read the same open task and both insert a
-- copy of it. The index is what makes the rule true under concurrency.
--
-- The index is partial and unique: many tasks have no source ("carriedFromId" is
-- NULL for every task that was not carried), and NULLs are never equal, so the
-- rule is "one copy per source task" and not "one task in the whole table".
--
-- Postgres would accept a plain UNIQUE on the column — NULLs are distinct there
-- as well — but the partial form says what the rule is, and it is smaller: the
-- index only holds the rows that are copies.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "SprintTask_carriedFromId_key"
  ON "SprintTask"("carriedFromId")
  WHERE "carriedFromId" IS NOT NULL;
