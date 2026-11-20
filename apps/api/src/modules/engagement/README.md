# API module: `engagement`

**Owner:** E10 · **Requirements:** gamification SRS (Engagement) · PRD US-92, US-93

Kudos, weekly quests and the leaderboard with opt-out. Asks growth-core for XP and levels; never
writes XP, levels or rules itself.

## What it does

| Area | Rules |
| --- | --- |
| **Kudos** | A user sends kudos to another active user of the workspace. Weekly send limit (default 3 per Monday-to-Sunday week), cooldown per recipient (default 7 days), a mutual exchange in the same week is flagged and its XP held, and a weekly received cap (a kudos over the cap is still created but pays 0). The receiver's XP event is created through growth-core's ledger. |
| **Quests** | A PM creates a quest (target, reward, dates), records a user's progress and verifies it. At or above the target one `QUEST` XP event is paid, already `AWARDED`, once (unique key), and a level-up notice goes through growth-core. |
| **Leaderboard** | Ranks `AWARDED` XP only, inside the viewer's PM group, for weekly (from Monday), monthly (last 30 days) and all-time windows. Ties share a rank. An opted-out user shows to peers as "Hidden user" (XP and rank only, no id, name or level), to themself as "You", and to a PM by name. |
| **IF-04** | `KudosQueryService.distinctApprovedSenders` tells growth-core how many different people sent a user an approved kudos (for the kudos badge). It lives in its own `KudosQueryModule` so growth-core can import it without a module cycle. |

## Layout

```
engagement/
├── engagement.module.ts            # providers, controllers; already registered in src/app.module.ts
├── kudos.controller.ts             # HTTP only: read the request, call the service
├── quests.controller.ts
├── leaderboard.controller.ts
├── kudos/                          # kudos.service.ts, kudos-rules.ts (pure), kudos-query.service.ts + .module.ts (IF-04)
├── leaderboard/                    # leaderboard.service.ts, leaderboard-rank.ts (pure), preference service
├── quests/                         # quests.service.ts, quest-input.ts (pure)
├── ports/                          # notification port (a no-op stand-in until E01 ships)
├── testing/                        # fakes used only by tests
├── paging.ts                       # shared cursor paging (re-exported from growth-core)
└── engagement-boundaries.spec.ts   # guard: no direct XpEvent / Level / XpRule access
```

## Routes

| Route | Who | What |
| --- | --- | --- |
| `POST /kudos` | user | `{ toUserId, category, message }`. The sender is the signed-in user; the day is the server's. |
| `GET /kudos?cursor=` | user, PM | Own kudos (user) or own users' kudos (PM) |
| `POST /pm/quests` | PM | Create a quest |
| `POST /pm/quests/:id/progress` | PM | `{ userId, count }` |
| `POST /pm/quests/:id/verify` | PM | `{ userId }`. Pays once if the target is met. |
| `GET /quests?cursor=` | any | Quests of the workspace |
| `GET /me/quest-progress`, `GET /pm/quest-progress` | user, PM | Own progress / own users' progress |
| `GET /leaderboard?window=weekly\|monthly\|all&cursor=` | any | The board for the caller's PM group |
| `GET` / `PUT /me/leaderboard-preference` | user | `{ hidden }` |

## Rules for this module

- Business rules live here, not in `apps/web`. Services check the rules; controllers only read the request.
- The caller always comes from the sign-in (`@CurrentActor()`), never from a body or query. Check role and
  PM scope on every route.
- Use growth-core only through its public index (`../growth-core/index.js`): the ledger (IF-01), levels
  (IF-02), rules (IF-03). Do not write `XpEvent`, `Level` or `XpRule` directly (a test enforces this).
- Every route answers 401 until real login (E01) provides an `ACTOR_RESOLVER`. Tests use the test-only header
  resolver in `growth-core/testing/`.
- Imports between our own files end in `.js` (ESM).

## Tests

```bash
pnpm test                        # unit tests (no database): run by CI
pnpm --filter api test:e2e       # real local Postgres (pnpm infra:up, db:deploy, db:seed first); not run by CI yet
```

Database tests use their own temporary workspace and users and delete them afterwards.
