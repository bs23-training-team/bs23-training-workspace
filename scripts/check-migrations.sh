#!/usr/bin/env bash
# Migration guard. Usage: scripts/check-migrations.sh <base-ref>   (CI passes origin/<base branch>)
# Fails when a PR edits or deletes an existing migration, adds more than one
# migration folder, or adds forbidden SQL. Warns on DROP statements.
set -euo pipefail

BASE="${1:?usage: check-migrations.sh <base-ref>}"
DIR="apps/api/prisma/migrations"
fail=0
err() { echo "::error::$1"; fail=1; }

# 1) Existing migrations must never change (applied history is immutable).
changed="$(git diff --name-status --no-renames "$BASE"...HEAD -- "$DIR" | grep -v '^A' || true)"
if [ -n "$changed" ]; then
  err "Existing migration files were modified or deleted. Never edit an applied migration; add a new one instead."
  echo "$changed"
fi

# 2) At most one new migration folder per PR.
new_dirs="$(git diff --name-only --diff-filter=A "$BASE"...HEAD -- "$DIR" | grep 'migration\.sql$' | xargs -r -n1 dirname | sort -u || true)"
count=0; [ -n "$new_dirs" ] && count="$(echo "$new_dirs" | wc -l | tr -d ' ')"
if [ "$count" -gt 1 ]; then
  err "This PR adds $count migrations. Keep one migration per PR."
  echo "$new_dirs"
fi

# 3) Forbidden / risky SQL in the new migration(s).
for d in $new_dirs; do
  f="$d/migration.sql"
  if grep -qi 'ON DELETE CASCADE' "$f"; then err "$f: ON DELETE CASCADE is not allowed (see docs/architecture.md §5.2 / schema README)."; fi
  if grep -q 'CREATE TABLE "_' "$f"; then err "$f: hidden implicit many-to-many table (CREATE TABLE \"_...\"). Use an explicit join model."; fi
  if grep -Eqi '^[[:space:]]*(DROP TABLE|DROP COLUMN|ALTER TABLE .* DROP COLUMN)' "$f"; then
    echo "::warning::$f contains DROP. Make sure data loss is intended and E11 has reviewed it."
  fi
done

if [ "$fail" -ne 0 ]; then exit 1; fi
echo "Migration guard passed ($count new migration)."
