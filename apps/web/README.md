# apps/web: Next.js frontend

The PM and trainee screens. It shows data and sends user actions to the NestJS API (`apps/api`);
it never decides permissions, scores, XP or approvals itself (SRS p.9).

## Run

From the repository root (first time: [docs/setup.md](../../docs/setup.md)):

```bash
pnpm infra:up
pnpm dev        # web on http://localhost:3000, api on http://localhost:4000
```

Environment: copy `.env.example` to `.env.local`. Every `NEXT_PUBLIC_*` variable is visible in the
browser, so never put a secret there.

## Code layout

```
src/
├── app/                    # routes (pages and layouts), App Router. Shell and route folders: E01
└── features/<module>/      # one folder per module, owned by its developer (see its README)
public/                     # static files (images, icons)
```

Pages in `src/app` stay thin and import from `src/features/<module>`. Shared components come from
`@bs23/ui` (E10), shared types from `@bs23/contracts`.

The SVGs in `public/` and the content of `src/app/page.tsx` are create-next-app placeholders. E01
replaces them when building the shell.

## Commands

```bash
pnpm --filter web dev
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web build
```
