# Contributing Guide

These rules keep 10 developers working in one repository without breaking each other's work.
Read this once fully before your first PR.

New here? Set up your machine first: [docs/setup.md](docs/setup.md).
Architecture decisions: [docs/adr/](docs/adr/).

> ⚠ **This repository is public.** Anyone on the internet can read every commit.
> Never commit passwords, API keys, tokens, real user data or `.env` files.

---

## 1. Where your code goes

Each member owns one module. Work **inside your own folders**:

| Owner | API (`apps/api/src/modules/`) | Web (`apps/web/src/features/`) |
|---|---|---|
| E01 | `identity`, `notifications`, `outbox`, `dashboard` | `shell`, `auth`, `dashboard`, `notifications` |
| E02 | `directory` | `directory` |
| E03 | `assessment` | `assessment` |
| E04 | `catalog` | `catalog` |
| E05 | `learning` | `learning` |
| E06 | `sprint` | `sprint` |
| E07 | `attendance` | `attendance` |
| E08 | `reports` | `reports` |
| E09 | `growth-core` | `gamification-core` |
| E10 | `engagement` (+ `packages/ui`) | `engagement` |
| E11 | `infra/`, `.github/`, root config, `docs/runbooks/` | — |

- Changing another person's folder is allowed, but **that owner must review** the PR.
- A module never writes directly to another module's database tables. Use that module's exported
  service or an outbox event.
- Business rules (permissions, scores, approvals, XP) live **only in the NestJS API**. Next.js
  only displays and forwards (SRS p.9).

---

## 2. Branches

```
main      ← production. Only E11 (or E01) merges here, at release time.
develop   ← integration / staging. Everyone opens PRs into develop.
  ├── feat/e04-add-course-form
  ├── fix/e07-leave-date-validation
  └── chore/e11-ci-cache
```

- **One branch = one small task**, not one branch per person.
- A branch should live **1–3 days**. Merge it, delete it, start a new one.
- Name format: `<type>/e<your number>-<short-task-name>`
  - types: `feat` (new feature), `fix` (bug fix), `chore` (setup/config), `docs`, `test`, `refactor`
- Never push directly to `main` or `develop`. GitHub blocks it anyway.

### Starting a task

```bash
git checkout develop
git pull
git checkout -b feat/e04-course-request-api
```

### Keeping your branch up to date

```bash
git fetch origin
git rebase origin/develop
# fix conflicts if any, then:
git push --force-with-lease
```

Use `--force-with-lease` (never plain `--force`), and only on **your own** branch.

---

## 3. Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(catalog): add course request endpoint
fix(attendance): treat missing checkout as Unknown, not zero
chore(e11): cache pnpm store in CI
```

Format: `type(module): short description in present tense`.

---

## 4. Pull requests

1. Push your branch and open a PR **into `develop`**.
2. Fill in the PR template completely.
3. Keep PRs **small**: aim for under ~400 changed lines. Big PRs get slow, shallow reviews.
4. Before opening the PR, run locally:
   ```bash
   pnpm lint
   pnpm test
   pnpm build
   ```
5. CI must be green (CI checks are being added). **Red CI = no merge**, no exceptions.
6. You need **1 approval**: from the code owner of the folders you changed, or from E11/E01.
7. After approval, **you merge your own PR** using **Squash and merge**, then delete the branch.

Reviewers: review within one working day. If you can't, say so in the PR.

Never skip, disable or delete tests just to make CI pass.

---

## 5. Database (Prisma) migrations ⚠ most important

We have **one shared schema** and **one shared migration history** (SRS p.8). Ten people
change it, so these rules are strict:

1. **One migration per PR.**
2. **Never edit a migration that is already merged** into `develop`.
3. If `develop` received a new migration while you were working: rebase, **delete your
   migration folder, generate it again**, and re-test.
4. **Dropping or renaming** a column/table: talk to E01 and E11 **before** writing it. We do
   these in steps (add new → copy data → remove old) so no history is lost.
5. Nobody runs migrations against staging or production from their laptop. Only the deploy
   pipeline does that.
6. Seed data (including the 50-course catalog) is for local/test/staging only, never production.

Schema PRs always need review from E01 + E11 (see CODEOWNERS).

---

## 6. Secrets and environment variables

- Real values go in `apps/api/.env` and `apps/web/.env.local`. These are git-ignored. **Never
  commit them.**
- When you need a **new** environment variable:
  1. Add it to the matching `.env.example` with a comment and a **fake** value.
  2. Mention it in your PR description.
  3. Tell E11, who adds the real value to staging/production.
- **Never put a secret in a `NEXT_PUBLIC_*` variable.** Those are sent to every browser.
- Never share API keys or passwords in WhatsApp/Messenger/email. Ask E11 for the agreed channel.
- Never log passwords, tokens, private assessment answers or leave reasons.

If you accidentally commit a secret: **tell E11 immediately**. Deleting the file is not
enough. The key must be revoked and replaced, because the repo is public.

---

## 7. Shared code

- `packages/contracts` (shared types/DTOs) and `packages/ui` (shared components) are used by
  everyone. Before changing them, **post in the team group** what you are changing and why.
- Breaking changes to shared code need review from E01 (contracts) or E10 (ui).

---

## 8. Dependencies

- Add packages with pnpm only: `pnpm --filter api add <package>` or `pnpm --filter web add <package>`.
- Explain in the PR **why** a new package is needed.
- Do not upgrade major versions (Next.js, NestJS, Prisma, Node, etc.) inside a feature PR.
  Upgrades get their own PR, coordinated with E11.
- Always commit the updated `pnpm-lock.yaml`.

---

## 9. Getting help

- Setup problems: [docs/setup.md#troubleshooting](docs/setup.md#troubleshooting), then E11.
- Architecture / data model questions: E01.
- CI, Docker, deployment, environments: E11.

When asking for help, include: what you ran, the full error text, and your branch name.
