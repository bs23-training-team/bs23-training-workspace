# API module: `growth-core`

**Owner:** E09 · **Requirements:** gamification SRS (Growth) · PRD US-86 to US-91

XP ledger and rules, PM review and manual adjustment, levels, sprint streak with private freezes, and
badges. The only module that writes XP. Other modules ask it through its exported services.

## What it does

| Area | Rules |
| --- | --- |
| **XP ledger** | Append-only `XpEvent`, unique per `(workspace, key)` so reporting a fact twice pays once. Only `AWARDED` XP counts. Quest and manual XP start `AWARDED`, everything else `PENDING`. |
| **Reward core** | Other modules report a FACT (a sprint, a mastered topic, a final assessment); this module decides the day, the amount and the key. Result is always a `PENDING` event. |
| **PM review** | A PM awards, holds, rejects or reverses an event, always with a reason, for their own users. One transaction, per-user lock, never below 0 XP, one `XpReview` row per decision, notice to the user. |
| **Manual adjustment** | A PM changes a user's XP by a non-zero whole number with a reason. `AWARDED` at once, no review row, never takes the total below 0, even when several arrive together. |
| **Levels and XP rules** | A level set is saved as one set (retire changed levels first, then insert). A "Level up" notice is created only when EARNED XP crosses a threshold. XP rules are editable; five are stored but not enforced. |
| **Streak and freezes** | Consecutive working days with a sprint; Friday and Saturday, leave, holidays and PM freezes neither count nor break it. The `Streak` row is a cache recomputed on demand (`runStreakRefresh` is the nightly entry point; scheduling it is not wired yet). No XP comes from a streak. |
| **Badges** | Special (a PM awards, with evidence) and Behavioral (awarded automatically by a rule: sprint streak, on-time streak, kudos from different people). One row per badge and user; revoke needs a reason; a badge a PM revoked is never awarded to that user again, by hand or automatically. Badges give no XP. |

## Layout

```
growth-core/
├── growth-core.module.ts        # providers, controllers; already registered in src/app.module.ts
├── index.ts                     # PUBLIC surface: other modules import from here only
├── xp.controller.ts             # HTTP only
├── settings.controller.ts
├── streak-badges.controller.ts
├── http/                        # ActorGuard, @CurrentActor, error filter, request readers
├── xp/                          # ledger, reward, review, adjustment, rules, query services
├── levels/  streak/  badges/    # one service each, with the pure rules in their own file
├── time/                        # org time (Asia/Dhaka, Monday weeks): the one place for day maths
├── ports/                       # interfaces to other modules (sprint, calendar, kudos, notifications)
└── testing/                     # fakes and the test-only login, used only by tests
```

## Routes

| Route | Who |
| --- | --- |
| `POST /pm/xp-events/:id/decision`, `POST /pm/xp-adjustments` | PM |
| `GET /pm/xp-events?status=&userId=&cursor=` (review queue; `status` is one status or several joined by commas, e.g. `PENDING,HELD`; each event carries the user's name) | PM |
| `GET /pm/xp-rules`, `PUT /pm/xp-rules` | PM |
| `GET /levels` (any), `PUT /pm/levels` | any / PM |
| `POST /pm/streak-freezes`, `GET /pm/streak-freezes?userId=` | PM |
| `POST /pm/badges` (`kind` optional: a rule means Behavioral, no rule means Special), `POST /pm/badges/:id/retire`, `POST /pm/badges/:id/awards`, `POST /pm/badge-awards/:id/revoke` | PM |
| `GET /badges?cursor=` (a user: own award and progress; a PM: every badge with who holds it, an automatic award shows no awarding PM) | any |
| `GET /pm/growth-summary?cursor=` (one line per user: XP, level, streak; the users come from `visibility/pm-visible-users.ts`, the directory's rule) | PM |
| `GET /me/growth` (level, `nextLevel` and `xpToNext`), `GET /me/xp-events` (no `flag`: "Suspicious exchange" is a PM's information), `GET /me/streak-freezes` | user |

## Ports and stand-ins

Other modules do not exist yet, so these are replaced by stand-ins. Swap the provider in
`growth-core.module.ts`; nothing else changes.

| Port | Real owner | Stand-in today |
| --- | --- | --- |
| Notifications (`NOTIFICATIONS`) | E01 | no-op |
| Sprint submissions (`SPRINT_SOURCE`) | E06 | returns nothing (every streak is 0) |
| Leave and holidays (`CALENDAR_SOURCE`) | E07 | returns nothing |
| Kudos senders (`KUDOS`, IF-04) | E10 engagement | empty (replaced by engagement's reader on the E10 branch) |
| Who is signed in (`req.user`, set by E01's `JwtAuthGuard`: `{ sub, sid, workspaceId, role }`, role `PM` or `USER`) | E01 | real: every route runs `JwtAuthGuard` then our `ActorGuard`; no valid token is 401; identity is never read from headers, query or body |

## Rules for this module

- Business rules live here, not in `apps/web`. Services check the rules; controllers only read the request.
- The caller always comes from the sign-in (`@CurrentActor()`), never from a body or query. Check role and
  PM scope on every route.
- Database access only through `PrismaService`. Never write another module's tables: use its exported service.
- `src/modules/growth-core/index.ts` is the only file other modules may import from.
- Imports between our own files end in `.js` (ESM).

## Tests

```bash
pnpm test                        # unit tests (no database, fakes only): run by CI
pnpm --filter api test:e2e       # real local Postgres (pnpm infra:up, db:deploy, db:seed first); not run by CI yet
```

Database tests use their own temporary workspace and users and delete them afterwards. The tests
check the database rules from the `gamification_rules` migration, so apply it locally first.
