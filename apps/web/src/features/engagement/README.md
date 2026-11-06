# Web feature: `engagement`

**Owner:** E10

Quests, leaderboards, hackathons, kudos.

## Suggested layout

```
engagement/
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
