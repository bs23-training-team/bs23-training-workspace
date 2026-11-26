# Connecting the web UI to your API module

**Audience:** every module owner (E01-E10). **Owner of this guide:** E11.
**Status:** plan for the integration phase. Items marked **(open)** still need a decision.

The UI in `apps/web` was imported from a working prototype. It runs on a **mock store**
(`apps/web/src/lib/mock`, kept in the browser's `localStorage`), so every screen already works without
the API. This guide explains how each owner replaces the mock with the real API, one screen at a time,
without breaking anyone else.

---

## 1. Where things are now

```
apps/web/src/
  app/**/page.tsx            thin: re-exports a page from features/ (routes are agreed with E01)
  features/<module>/
    pages/                   the screens of the module
    components/              components used by those screens
    api.ts                   today: MOCK functions (synchronous, read/write the mock store)
    index.ts                 what other features may import
  lib/mock/                  mock store, seed data, types, selectors (E11 deletes this at the end)
  components/ui/             shared building blocks until packages/ui (E10) takes over
```

- `features/<module>/api.ts` currently holds the mock. The older feature READMEs say `api.ts` is the
  real API client. That is the target; see Step 0 below.
- Screens read data with `useDB()` and call synchronous functions such as `createTrainee(...)`.
  A real API is asynchronous, so **each screen needs a small rewrite** (loading, error, `await`).
  This is expected work, not a bug.
- E08's `features/reports` was built against the API from the start. Use it as a reference, but see
  the two problems in section 7.

## 2. Rules that do not change

1. **No business rules in `apps/web`** (architecture 3.3 rule 4). The mock contains rules because it
   had to; the real rule lives in the API. When you connect a screen, **delete the UI copy of the
   rule**, do not keep both. Rules currently only in the mock include: the attendance day rule, badge
   rules, XP and streak rules, sprint on-time check, assessment scoring, level calculation, archiving
   expired users, permission checks.
2. **Identity comes only from `req.user`.** The web never sends `x-actor-*` or `x-workspace-id`.
3. **Shared types go to `packages/contracts/src/<module>/`** and both sides import them.
4. **One module per PR, only your own files.** Shared files (`lib/mock`, `components/ui`, `app/**/layout.tsx`,
   `next.config.ts`, `package.json` dependencies) go through their owner: E01 shell, E10 ui, E11 tooling.
5. **Never commit `.env` files or secrets.** The repo is public. `NEXT_PUBLIC_*` variables are visible
   in the browser.
6. The mock's seed password and demo accounts are local only. The mock and the real API have
   **different data**: do not expect `u1` or `BS23001` from the mock to exist in Postgres.

## 3. Run everything locally

Docker Desktop must be running. Windows users use Git Bash.

```
git checkout develop
git pull origin develop
pnpm setup:local
cp -n apps/web/.env.example apps/web/.env.local
pnpm dev
```

Web: http://localhost:3000 · API: http://localhost:4000. `pnpm setup:local` is safe to repeat after
every pull. If something fails, see `docs/setup.md`.

`apps/web/.env.local` needs `NEXT_PUBLIC_API_URL="http://localhost:4000"`.

`pnpm setup:local` does not build `@bs23/contracts`, and the API reads it from `packages/contracts/dist`. After
every pull that touches `packages/contracts`, and before `pnpm --filter api typecheck` or
`pnpm --filter api test`, run:

```
pnpm --filter @bs23/contracts build
```

## 4. How the web talks to the API

Facts from the code on `develop` (verified by reading it, not by running it):

- Login is `POST /auth/login`. It returns `{ accessToken, refreshToken }` in the JSON body.
- Every protected route needs the header `Authorization: Bearer <accessToken>`. The access token is
  short-lived (15 minutes). `POST /auth/refresh` gets a new one. `GET /auth/me` returns the caller.
- There is **no global route prefix**: routes are `/auth/login`, `/me/growth`, `/leaderboard`, and so on.
- Errors come back with HTTP status and a JSON `message`.

**One shared client (E01).** To avoid ten different `fetch` wrappers, E01 provides
`apps/web/src/lib/api-client.ts`:

- `request<T>(path, options)` adds the `Authorization` header, retries once after a refresh on `401`,
  and throws an error whose message is the API's `message`. `requestBlob(path)` does the same for a
  protected file.
- The session ends (tokens cleared, `onSessionEnded` listeners called) only when the refresh fails too.
- For local development the access and refresh tokens are kept in `localStorage`; before staging they
  move to `httpOnly` cookies (`docs/architecture.md` 6.1). Module owners must not store tokens
  themselves.

Connect protected routes through this client only.

## 5. Order of connection

Connect in this order, because later steps need earlier ones:

1. **E01: auth and shell.** Login, logout, refresh, `/auth/me`, the shared client, route guards.
2. **E02: directory.** Users, archive, profile, account creation.
3. **E03 assessment, E04 catalog, E05 learning.** In parallel, they only need a signed-in user.
4. **E06 sprint, E07 attendance.**
5. **E09 gamification-core, E10 engagement, notifications.**
6. **E01: dashboards** last, because they read from almost every module.
7. **E08: reports** already has its own client; align it with section 4.

A single screen is either fully mock or fully real. Do not mix mock and real data on one screen.

## 6. Steps for each module owner

**Step 0 (E11, once, before anyone starts).** Rename every `features/<module>/api.ts` to
`mock-api.ts` and create an empty `api.ts` for the real client. After that, `git grep mock-api` always
shows what is still mock. Do not start Step 1 until this PR is merged.

For every screen of your module:

1. **API first.** The endpoint exists on `develop`, has an e2e or service test, and its request and
   response types are in `packages/contracts/src/<module>/`.
2. **Write the call** in `features/<module>/api.ts` using the shared client and the contract types.
3. **Rewrite the screen.**
   - Replace `useDB()` selectors with a fetch (a small hook in `features/<module>/hooks.ts`).
   - Show three states: loading, error (with the API's message), data.
   - Mutations are `async`. Show the API's error text instead of re-checking the rule in the UI.
   - Keep light input checks (required field, email format) only for fast feedback. The API decides.
4. **Delete the UI copy of the rule** and the `mock-api.ts` functions nobody imports any more.
5. **Check it by hand** against the real API: sign in as a PM and as a user from the **API seed**
   (not the mock accounts), do the whole flow, then do it with a wrong input and with the wrong role
   (it must be refused by the API, not hidden by the UI).
6. **Open the PR** (section 8).

When the last screen of your module no longer imports `mock-api.ts`, delete the file, delete
`fixtures.ts` if you had one, and remove your part of `lib/mock`. E11 removes `lib/mock` when every
module is done.

## 7. Known problems to fix before connecting (found in the code, please verify)

- **CORS (fixed by E11).** `main.ts` now calls `enableCors` with the origins from `WEB_ORIGIN`
  (default `http://localhost:3000`; staging and production must set it). `*` is refused and cookies are
  not enabled: the token goes in the `Authorization` header. Run `git pull` and, if your `apps/api/.env`
  is older than `.env.example`, add the `WEB_ORIGIN` line (not required for local work).
- **E08's client uses cookies.** `features/reports/api.ts` sends `credentials: 'include'` and no
  `Authorization` header, but the API guard accepts only `Authorization: Bearer ...`. Its calls would
  return `401`. Align it with the shared client once E01 provides it.
- **Rules the API must own.** The attendance day rule (FR-ATT-08), badge rules (FR-GAM-06) and the
  account credentials flow (FR-AUTH-08) were built in the UI mock only. Their API versions are not
  written yet. Owners: E07, E09/E10, E01/E02.
- **Awards without a PM.** An automatic badge award has no awarding PM, but `BadgeAward.awardedById` is
  not nullable. Owner: E10 with E11 (migration).
- **Public holidays and ERP sync status** have no data source in the API yet. Owner: E07.

## 8. Pull request rules

- Title: `feat(<module>): connect <screen> to the API`. Other types: `fix`, `refactor`.
- Description: what changed, and **How was it tested?** with real command output and what you clicked.
  A screenshot of the working screen helps.
- Required checks must be green: `Lint, typecheck, test, migrations, build`, `Migration guard`,
  `PR title`. E11 reviews. The author squash-merges after approval. No admin bypass on someone else's PR.
- Before you ask for review run, from the repo root:

```
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web build
```

- Keep PRs small (about 500 changed lines or less). Split a big screen into several PRs.

## 9. Common problems

| Problem | Likely cause |
|---|---|
| Browser console: CORS error | The web origin is not in `WEB_ORIGIN` of the API (check scheme, host and port, no trailing slash), or the API was not restarted after changing `.env` |
| `401` on every call | No `Authorization` header, or the access token expired and was not refreshed |
| `403` | The role is not allowed on that route: this is correct behaviour, fix the test user |
| Screen shows old fake data | The screen still imports `mock-api.ts` |
| Works for `u1`, not after connecting | The mock accounts do not exist in Postgres; use the API seed |
| `NEXT_PUBLIC_API_URL` has no effect | Restart `pnpm dev` after editing `.env.local` |
| Many type errors in `apps/api`, or tests fail with `... is undefined` right after a pull | `packages/contracts/dist` is old: run `pnpm --filter @bs23/contracts build` |

## 10. Open decisions

| # | Decision | Owner |
|---|---|---|
| 1 | `httpOnly` cookies and the Next.js proxy for staging (local development: `localStorage`, decided 2026-11-26) | E01 |
| 2 | `WEB_ORIGIN` values for staging and production (local default is done) | E11 |
| 3 | Data-fetching helper (a small hook, or a library) and the loading/error pattern | E11 |
| 4 | Whether to add a web test runner (Vitest) before the first screen is connected | E11 |
