# @bs23/ui

Shared React components for `apps/web` (owner: **E10**). Buttons, dialogs, tables, form controls
and other building blocks that several modules use, matching the approved dark navy / violet design.

This package ships TypeScript source. Next.js compiles it, so there is no build step.

## Connect it to apps/web (E10, when the first component exists)

1. `pnpm --filter web add @bs23/ui@workspace:*`
2. In `apps/web/next.config.ts` add `transpilePackages: ['@bs23/ui']`
3. `import { Button } from '@bs23/ui';`

Rules: no data fetching or business logic in this package, only presentation.
