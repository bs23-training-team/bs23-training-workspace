# Web feature: `auth`

**Owner:** E01

Login, password/recovery screens, first-login redirect to the expertise survey.

## Connected to the API

Sign-in, sign-out, the session check and the passwords call the API (`api.ts`). Profile, photo and the session
list are still mock (`mock-api.ts`).

- The API decides who is signed in (`useApiSession`, `GET /auth/me`). Tokens are handled only by
  `lib/api-client.ts`.
- Until the other modules are connected, `api.ts` copies the signed-in account into the mock store (a user's
  position, attendance mode and teams come from `GET /directory/me`). Mock screens show mock data for it.
- Run the API (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`) and sign in with an API account: a PM
  with the email, a user with the user ID. The mock demo accounts no longer sign in.

## Suggested layout

```
auth/
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
