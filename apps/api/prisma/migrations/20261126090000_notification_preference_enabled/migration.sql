-- NotificationPreference: the switch is about the bell, not email. Rename "emailEnabled" to "enabled" and default it to on.
-- RENAME keeps the existing rows and values (no drop, no data loss).
ALTER TABLE "NotificationPreference" RENAME COLUMN "emailEnabled" TO "enabled";
ALTER TABLE "NotificationPreference" ALTER COLUMN "enabled" SET DEFAULT true;
