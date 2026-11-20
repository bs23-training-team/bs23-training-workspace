#!/usr/bin/env bash
# Reads changed file paths on stdin (one per line) and prints the labels to apply (one per line).
# Pure function of its input, so it can be tested without GitHub.
set -euo pipefail
declare -A labels
while IFS= read -r f; do
  case "$f" in
    apps/api/src/modules/*/*)        m="${f#apps/api/src/modules/}"; labels["mod:${m%%/*}"]=1 ;;
    apps/web/src/features/*/*)       m="${f#apps/web/src/features/}"; labels["mod:${m%%/*}"]=1 ;;
    packages/contracts/src/*/*)      m="${f#packages/contracts/src/}"; labels["mod:${m%%/*}"]=1 ;;
  esac
  case "$f" in
    apps/api/prisma/migrations/*)    labels["migration"]=1 ;;
    apps/api/prisma/schema/*|apps/api/prisma/schema.prisma) labels["schema"]=1 ;;
    apps/api/prisma/seed/*)          labels["seed"]=1 ;;
    .github/*|infra/*|scripts/*|turbo.json|.nvmrc) labels["infra"]=1 ;;
    docs/*|*.md)                     labels["docs"]=1 ;;
    pnpm-lock.yaml|package.json|*/package.json) labels["deps"]=1 ;;
  esac
done
for l in "${!labels[@]}"; do echo "$l"; done | sort
