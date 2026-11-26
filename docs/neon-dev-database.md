# Shared Neon development database

One PostgreSQL database on Neon (the **development** branch) is shared by the whole team for API and
web integration. Your own local Docker database (port 5433) stays the place where you write and test
migrations. Owner of this setup and of the migration approvals: **E11**.

## Two databases, two jobs

| | Local (Docker) | Shared (Neon development branch) |
|---|---|---|
| Used for | writing and testing migrations, unit and e2e tests | API and web integration, team testing |
| Schema changes | you, with `pnpm db:migrate` | **only the pipeline** (`Migrate Neon dev`), after a merge |
| Role | `bs23` | `tms_dev` for the API (read and write data, no DDL) |

## Variables (same names as everywhere else in the repo)

| Variable | Local `.env` (default) | On the shared database |
|---|---|---|
| `DATABASE_URL` | local Docker | `tms_dev`, **pooled** Neon connection (running API only) |
| `DIRECT_URL` | local Docker | owner, **direct** connection. Used only by the pipeline. Never in a developer `.env`. |

Keep `.env` on the local database. Tests refuse to run when `DATABASE_URL` is not on this machine, and
`pnpm db:seed` / `pnpm db:migrate` read `DIRECT_URL` first, so a local `DIRECT_URL` keeps them away from
Neon. To run the API once against Neon, override only that command:
`DATABASE_URL="<tms_dev pooled url>" pnpm --filter api dev`. Never commit a connection string.

## The flow

```
change schema -> pnpm db:migrate (local) -> test -> PR -> CI + review -> squash merge to develop
  -> workflow "Migrate Neon dev" starts -> list of new migrations shown
  -> E11 approves the "neon-dev" environment -> prisma migrate deploy -> prisma migrate status
```

- Nothing is applied on a pull request, and a green CI does not apply anything. Only a merge does.
- Merged migrations are never edited (architecture 5.2). Fix a mistake with a new migration.
- Prefer additive changes (expand, copy, contract). Other developers may still run older code against
  the shared schema for a while.
- After a merge that changes the schema: `git pull`, `pnpm install`, `pnpm db:generate`.

## Rules for the shared database

- No `CREATE`, `ALTER`, `DROP`, `prisma migrate dev`, `prisma migrate deploy` or `pnpm db:seed` against it
  by hand. The pipeline is the only thing that changes the schema.
- Do not delete data that is not yours.
- The repository is public and so are the workflow logs. No password, connection string or token goes
  into a commit, an issue, a PR or a log.
- Demo accounts: the seed password `Password123!` is public. If the shared database is ever seeded, E11
  does it with a strong `SEED_PASSWORD`.

## One-time setup (E11)

Neon:
1. Neon development branch: copy the **direct** (not pooled) connection string of the owner role.
   If you can, create a separate `tms_migrator` role for the pipeline instead of `neondb_owner`.
2. Keep the production branch and its credentials separate. The pipeline never receives them.

GitHub (Settings > Environments > New environment):
1. Name: `neon-dev`.
2. Required reviewers: E11. Deployment branches: only `develop`.
3. Environment secret `NEON_DIRECT_URL`: the direct connection string.
4. Environment variable `NEON_DEV_HOST`: the host of that string (no password), so the pipeline can
   refuse a wrong target.

First run: do a rehearsal on a throw-away Neon child branch (put its URL and host in the environment),
then switch the secret and the variable to the real development branch.

## When a run fails

1. Read the failed step. A failed migration is recorded as failed by Prisma and later runs stop on it.
2. E11 checks what the SQL did on Neon (`DIRECT_URL=... pnpm db:status` from a trusted machine).
3. Either fix forward with a new migration, or mark the failed one with
   `prisma migrate resolve --rolled-back <name>` (after undoing its changes by hand) or
   `--applied <name>` (if it really finished). Then run the workflow again from the Actions tab
   (Run workflow).
4. Tell the team in the channel when Neon is healthy again.
