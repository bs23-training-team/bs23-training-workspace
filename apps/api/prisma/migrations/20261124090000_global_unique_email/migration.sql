-- Identity (E01): an email is unique in the WHOLE system, not only inside one workspace.
-- Agreed rule: email, PM ID and User ID are each unique everywhere. PM ID and User ID are
-- already primary keys; this makes the email rule match. No data change, no DROP.
--
-- The init migration's triggers only compared a Pm with the Users of the SAME workspace and
-- left two PMs (or two Users) in different workspaces free to share an email, so sign-in and
-- Forgot password could not tell the accounts apart. The wording of the exceptions is kept:
-- the API recognises it (isEmailTriggerError) and answers 409 instead of 500.
--
-- The advisory lock makes two simultaneous inserts of the same email take turns, so both
-- cannot pass the check before either is visible.

CREATE OR REPLACE FUNCTION fn_pm_email_unique() RETURNS trigger AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(lower(NEW."email")));
  IF EXISTS (SELECT 1 FROM "User" WHERE lower("email") = lower(NEW."email")) THEN
    RAISE EXCEPTION 'email % is already used by a User', NEW."email";
  END IF;
  IF EXISTS (SELECT 1 FROM "Pm" WHERE lower("email") = lower(NEW."email") AND "pmId" <> NEW."pmId") THEN
    RAISE EXCEPTION 'email % is already used by a PM', NEW."email";
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_user_email_unique() RETURNS trigger AS $fn$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(lower(NEW."email")));
  IF EXISTS (SELECT 1 FROM "Pm" WHERE lower("email") = lower(NEW."email")) THEN
    RAISE EXCEPTION 'email % is already used by a PM', NEW."email";
  END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE lower("email") = lower(NEW."email") AND "userId" <> NEW."userId") THEN
    RAISE EXCEPTION 'email % is already used by a User', NEW."email";
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;
