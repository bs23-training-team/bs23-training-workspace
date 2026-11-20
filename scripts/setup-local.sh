#!/usr/bin/env bash
# One-command local setup: pnpm setup:local
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

if [ -f apps/api/.env.example ] && [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  echo "==> Created apps/api/.env from .env.example (edit it if needed; never commit it)"
fi

echo "==> Starting Postgres (Docker must be running)"
pnpm infra:up

echo "==> Applying migrations"
pnpm db:deploy

echo "==> Generating Prisma client"
pnpm db:generate

echo "==> Seeding local data"
pnpm db:seed

echo "Done. Start the apps with: pnpm dev"
