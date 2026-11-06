# @bs23/contracts

Shared **types only**: request/response DTOs, enums, ID types and event payload shapes that both
`apps/api` and `apps/web` must agree on. No business logic, no database code, no secrets.

## Layout

```
src/
  index.ts          ← re-exports every module folder
  health/           ← E11
  identity/         ← E01  (create your folder when you start)
  directory/        ← E02
  ...
```

## Rules

- One folder per module, owned by that module's developer.
- Every relative import ends in `.js` (ESM): `export * from './catalog/index.js';`
- Changing an existing type can break other modules. Announce it in the team group first, and
  E01 reviews (see CODEOWNERS).
- Never put private fields here (password hashes, answer keys, leave reasons).

## Use it

```ts
import type { HealthResponse } from '@bs23/contracts';
```

`apps/api` already depends on it. In `apps/web` run `pnpm --filter web add @bs23/contracts@workspace:*`.
`pnpm dev` and `pnpm build` rebuild this package automatically (Turborepo runs it first).
