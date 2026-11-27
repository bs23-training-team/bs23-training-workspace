# Web feature: `directory`

**Owner:** E02

All Users table, Add/Edit trainee, teams, full evaluation profile with ten cards, RND feedback.

## Connected to the API so far

| Screen | Routes | Still on the mock |
| --- | --- | --- |
| Add PM, Add user | `POST /auth/accounts/pms`, `/auth/accounts/trainees` | Edit user |
| Teams tab, Create team, the team box of Add user | `GET` / `POST /directory/teams` | All Users table, profile page, export |

A new account is stored in the database but does not appear in the All Users table until that table is
connected.

## Suggested layout

```
directory/
├── components/        # React components of this feature
├── api.ts             # calls to the NestJS API (http://localhost:4000 locally, from NEXT_PUBLIC_API_URL)
├── fixtures.ts        # fake data to build the UI before the API is ready; delete when connected
└── index.ts           # what pages import from this feature
```

## Rules

- Pages in `src/app/...` stay thin: they import from this folder. Route folders are agreed with E01
  (shell owner).
- No business rules here (permissions, scores, XP, approvals): the API decides, the UI shows.
- Shared types come from `@bs23/contracts`; shared building blocks (buttons, tables, dialogs) from
  `@bs23/ui` (E10).
- Never put a secret in a `NEXT_PUBLIC_*` variable.
