#!/usr/bin/env bash
# One-command local setup: pnpm setup:local
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

if [ -f apps/api/.env.example ] && [ ! -f apps/api/.env ]; then
  command -v openssl >/dev/null 2>&1 || { echo "openssl is required to create the JWT secrets"; exit 1; }
  cp apps/api/.env.example apps/api/.env
  # Two different random JWT secrets for this machine only (the API refuses to start without them).
  for name in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do
    sed -i.bak "s|^${name}=.*|${name}=$(openssl rand -hex 32)|" apps/api/.env
    rm -f apps/api/.env.bak
  done
  echo "==> Created apps/api/.env from .env.example with new random JWT secrets (edit it if needed; never commit it)"
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
