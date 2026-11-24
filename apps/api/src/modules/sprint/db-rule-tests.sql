-- Database rule tests for the E06 sprint schema changes.
--
-- Each block below TRIES to insert a row that must be REFUSED by the database.
-- A block that inserts successfully is a FAILURE of the rule.
--
-- Run against a database that already has the init migration and the
-- e06_sprint_schema_fixes migration applied:
--
--   docker exec -i bs23-postgres-1 psql -U bs23 -d bs23_dev -v ON_ERROR_STOP=0 \
--     < apps/api/src/modules/sprint/db-rule-tests.sql
--
-- ON_ERROR_STOP is off on purpose: we want to see every case run, not stop at the
-- first one. The final query prints a PASS/FAIL summary.

\set ON_ERROR_STOP off
\pset pager off

-- A workspace, a PM and a user to hang the rows off. The seeded ones are used when
-- they exist; otherwise minimal rows are created. Everything is rolled back at the end.
BEGIN;

-- ---------------------------------------------------------------------------------
-- F-04: a sprint week must start on a Monday.
-- 2026-11-23 is a Monday (a valid weekStart). 2026-11-24 is a Tuesday (must fail).
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
  v_team     text;
  v_pm       text;
  v_user     text;
  v_week     text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  SELECT "pmId" INTO v_pm FROM "Pm" LIMIT 1;
  SELECT "userId" INTO v_user FROM "User" LIMIT 1;

  IF v_workspace IS NULL OR v_pm IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: seed data missing (workspace/pm/user)';
    RETURN;
  END IF;

  -- The rule test gets its OWN team. Reusing a seeded team would break the "a Monday
  -- weekStart is accepted" case the moment the seed has a sprint week for that Monday:
  -- the unique index on [teamId, weekStart] would refuse the row, and the refusal would
  -- look like the CHECK firing. The name is unique per workspace, and the whole
  -- transaction is rolled back at the end.
  v_team := gen_random_uuid()::text;
  INSERT INTO "Team" ("id", "workspaceId", "name", "pmId", "createdAt", "updatedAt")
  VALUES (v_team, v_workspace, 'rule-test-team-' || v_team, v_pm, now(), now());

  -- A Monday weekStart is accepted.
  BEGIN
    INSERT INTO "SprintWeek" ("id", "workspaceId", "teamId", "weekStart", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_team, DATE '2026-11-23', now(), now());
    RAISE NOTICE 'PASS: Monday weekStart accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: Monday weekStart was refused';
  END;

  -- A Tuesday weekStart must be refused.
  BEGIN
    INSERT INTO "SprintWeek" ("id", "workspaceId", "teamId", "weekStart", "createdAt", "updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_team, DATE '2026-11-24', now(), now());
    RAISE NOTICE 'FAIL: Tuesday weekStart was accepted (chk_sprintweek_monday did not fire)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: Tuesday weekStart refused';
  END;
END $$;

-- ---------------------------------------------------------------------------------
-- F-01: category and owner go together.
--   (a) an own task: no category, no owner  -> accepted
--   (b) an L&D task: category LND, owner set -> accepted
--   (c) category but no owner                -> refused
--   (d) owner but no category                -> refused
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
  v_pm       text;
  v_user     text;
  v_owner    text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  SELECT "pmId" INTO v_pm FROM "Pm" LIMIT 1;
  SELECT "userId" INTO v_user FROM "User" LIMIT 1;
  SELECT "id" INTO v_owner FROM "TaskOwner" WHERE "kind" = 'LND' LIMIT 1;
  -- The seed has no TaskOwner yet (OQ-6: they come from seed data of their own).
  -- Create one inside this transaction so the owner cases are always exercised.
  IF v_owner IS NULL THEN
    INSERT INTO "TaskOwner" ("id","workspaceId","name","kind","email","isActive","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'Rule Test L&D', 'LND',
            'rule-test-owner@example.test', true, now(), now())
    RETURNING "id" INTO v_owner;
  END IF;

  IF v_workspace IS NULL OR v_pm IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: seed data missing (workspace/pm/user)';
    RETURN;
  END IF;

  -- (a) own task: neither category nor owner.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
      "plannedHours","actualHours","blocker","done","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'own task', 'd',
      NULL, 1.0, 0, '', false, now(), now());
    RAISE NOTICE 'PASS: own task (no category, no owner) accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: own task was refused';
  END;

  -- (b) L&D task: both set.
  IF v_owner IS NULL THEN
    RAISE NOTICE 'SKIP: no LND TaskOwner to test the owner case';
  ELSE
    BEGIN
      INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
        "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'ld task', 'd',
        'LND', 1.0, 0, '', false, v_owner, 'PENDING', now(), now(), now());
      RAISE NOTICE 'PASS: L&D task (category and owner) accepted';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'FAIL: L&D task was refused';
    END;

    -- (c) category but no owner: refused.
    BEGIN
      INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
        "plannedHours","actualHours","blocker","done","verification","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'half task', 'd',
        'LND', 1.0, 0, '', false, NULL, now(), now());
      RAISE NOTICE 'FAIL: category without owner was accepted (chk_task_category_iff_owner did not fire)';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'PASS: category without owner refused';
    END;

    -- (d) owner but no category: refused.
    BEGIN
      INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
        "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'half task 2', 'd',
        NULL, 1.0, 0, '', false, v_owner, 'PENDING', now(), now(), now());
      RAISE NOTICE 'FAIL: owner without category was accepted (chk_task_category_iff_owner did not fire)';
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'PASS: owner without category refused';
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------
-- F-06: decide once. The reply columns must agree with the verification state.
--   (a) PENDING with a reply time set      -> refused
--   (b) VERIFIED without a reply time      -> refused
--   (c) PENDING without a reply            -> accepted
--   (d) VERIFIED with a reply time and PM  -> accepted
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
  v_pm       text;
  v_user     text;
  v_owner    text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  SELECT "pmId" INTO v_pm FROM "Pm" LIMIT 1;
  SELECT "userId" INTO v_user FROM "User" LIMIT 1;
  SELECT "id" INTO v_owner FROM "TaskOwner" WHERE "kind" = 'LND' LIMIT 1;
  IF v_owner IS NULL THEN
    INSERT INTO "TaskOwner" ("id","workspaceId","name","kind","email","isActive","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'Rule Test L&D 2', 'LND',
            'rule-test-owner-2@example.test', true, now(), now())
    RETURNING "id" INTO v_owner;
  END IF;

  IF v_workspace IS NULL OR v_pm IS NULL OR v_user IS NULL OR v_owner IS NULL THEN
    RAISE NOTICE 'SKIP: seed data missing for the reply-state cases';
    RETURN;
  END IF;

  -- (a) PENDING but ownerRepliedAt is set: refused.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
      "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt",
      "ownerRepliedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'a', 'd',
      'LND', 1.0, 0, '', false, v_owner, 'PENDING', now(), now(), now(), now());
    RAISE NOTICE 'FAIL: PENDING with a reply time was accepted (chk_task_reply_state did not fire)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: PENDING with a reply time refused';
  END;

  -- (b) VERIFIED without a reply time: refused.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
      "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt",
      "createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'b', 'd',
      'LND', 1.0, 0, '', false, v_owner, 'VERIFIED', now(), now(), now());
    RAISE NOTICE 'FAIL: VERIFIED without a reply time was accepted (chk_task_reply_state did not fire)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: VERIFIED without a reply time refused';
  END;

  -- (c) PENDING without a reply: accepted.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
      "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'c', 'd',
      'LND', 1.0, 0, '', false, v_owner, 'PENDING', now(), now(), now());
    RAISE NOTICE 'PASS: PENDING without a reply accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: PENDING without a reply was refused';
  END;

  -- (d) VERIFIED with a reply time and the PM who recorded it: accepted.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","category",
      "plannedHours","actualHours","blocker","done","ownerId","verification","ownerRequestedAt",
      "ownerRepliedAt","ownerReplyById","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'd', 'd',
      'LND', 1.0, 0, '', false, v_owner, 'VERIFIED', now(), now(), v_pm, now(), now());
    RAISE NOTICE 'PASS: VERIFIED with a reply time and PM accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: VERIFIED with a reply time and PM was refused';
  END;
END $$;

-- ---------------------------------------------------------------------------------
-- F-10: the Teams link must be https (or empty).
--   (a) https  -> accepted
--   (b) http   -> refused
--   (c) javascript -> refused
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
  v_pm       text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  SELECT "pmId" INTO v_pm FROM "Pm" LIMIT 1;

  IF v_workspace IS NULL OR v_pm IS NULL THEN
    RAISE NOTICE 'SKIP: seed data missing (workspace/pm)';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO "DsMeeting" ("id","workspaceId","title","scheduledAt","teamsLink","createdById","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'https meeting', now() + interval '1 day',
      'https://teams.microsoft.com/l/meetup-join/x', v_pm, now(), now());
    RAISE NOTICE 'PASS: https Teams link accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: https Teams link was refused';
  END;

  BEGIN
    INSERT INTO "DsMeeting" ("id","workspaceId","title","scheduledAt","teamsLink","createdById","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'http meeting', now() + interval '1 day',
      'http://teams.microsoft.com/l/meetup-join/x', v_pm, now(), now());
    RAISE NOTICE 'FAIL: http Teams link was accepted (chk_dsmeeting_teamslink_https did not fire)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: http Teams link refused';
  END;

  BEGIN
    INSERT INTO "DsMeeting" ("id","workspaceId","title","scheduledAt","teamsLink","createdById","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'js meeting', now() + interval '1 day',
      'javascript:alert(1)', v_pm, now(), now());
    RAISE NOTICE 'FAIL: javascript Teams link was accepted (chk_dsmeeting_teamslink_https did not fire)';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: javascript Teams link refused';
  END;
END $$;

-- ---------------------------------------------------------------------------------
-- F-03: a meeting may arrive without a PM (from a sync or the seed).
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  IF v_workspace IS NULL THEN
    RAISE NOTICE 'SKIP: no workspace';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO "DsMeeting" ("id","workspaceId","title","scheduledAt","teamsLink","source","externalId","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, 'synced meeting', now() + interval '1 day',
      NULL, 'teams', 'ext-1', now(), now());
    RAISE NOTICE 'PASS: meeting without a PM (sync source) accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'FAIL: meeting without a PM was refused';
  END;
END $$;

-- ---------------------------------------------------------------------------------
-- Carry forward is idempotent (DS-04.4): a task is carried forward AT MOST ONCE.
--
-- The unique index on "carriedFromId" is what makes that true under concurrency: two
-- requests at the same moment (a double click, two tabs) both read the same open task,
-- and only the index can decide which copy wins. A read-then-write check would let both
-- through.
--
--   (a) a task with no source (carriedFromId IS NULL)  -> accepted, many times over
--   (b) a first copy of a source task                   -> accepted
--   (c) a SECOND copy of the same source task          -> refused
-- ---------------------------------------------------------------------------------
DO $$
DECLARE
  v_workspace text;
  v_user      text;
  v_source    text;
BEGIN
  SELECT "id" INTO v_workspace FROM "Workspace" LIMIT 1;
  SELECT "userId" INTO v_user FROM "User" LIMIT 1;

  IF v_workspace IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'SKIP: seed data missing (workspace/user)';
    RETURN;
  END IF;

  -- The source task: an open task of the previous day, with no source of its own.
  v_source := gen_random_uuid()::text;
  INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","plannedHours","actualHours","blocker","done","carriedFromId","createdAt","updatedAt")
  VALUES (v_source, v_workspace, v_user, DATE '2026-11-22', 'source task', 'd', 1.0, 0, '', false, NULL, now(), now());

  -- (a) a task with no source at all: many such rows may exist.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","plannedHours","actualHours","blocker","done","carriedFromId","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'own task', 'd', 1.0, 0, '', false, NULL, now(), now());
    RAISE NOTICE 'PASS: a task with no source accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'FAIL: a task with no source was refused';
  END;

  -- (b) the first copy of the source task is accepted.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","plannedHours","actualHours","blocker","done","carriedFromId","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'carried task', 'd', 1.0, 0, '', false, v_source, now(), now());
    RAISE NOTICE 'PASS: the first copy of a task accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'FAIL: the first copy of a task was refused';
  END;

  -- (c) the second copy of the SAME source task must be refused.
  BEGIN
    INSERT INTO "SprintTask" ("id","workspaceId","userId","date","title","description","plannedHours","actualHours","blocker","done","carriedFromId","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, v_workspace, v_user, DATE '2026-11-23', 'carried twice', 'd', 1.0, 0, '', false, v_source, now(), now());
    RAISE NOTICE 'FAIL: a task was carried forward twice (SprintTask_carriedFromId_key did not fire)';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS: a second copy of the same task refused';
  END;
END $$;

ROLLBACK;
