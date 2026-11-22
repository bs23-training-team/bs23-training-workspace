# AGENTS.md (apps/api)

Notes for AI coding assistants working in this folder. People: see [README.md](README.md).

- This is the NestJS backend of the BS23 Training Workspace. Architecture and rules: `docs/architecture.md`.
  The PRD and SRS are not in the repository; ask the module owner or E11 when a requirement is unclear.
- ESM project: relative imports end in `.js`. Tests use Vitest, lint uses oxlint.
- Database access only through the global `PrismaService` (`src/prisma/prisma.service.ts`), Prisma 7.10.1.
  The generated client is in `src/generated/prisma` (git-ignored, created by `pnpm db:generate`).
- Never run migrations against staging or production, and never edit an existing migration folder.
- Each module lives in `src/modules/<module>/` and is owned by one team member (see that folder's README).
  Do not change another module's files or database section.
- Observability tooling has not been chosen yet. Do not add `@nestjs/observe` or any telemetry SDK.
- Secrets come from environment variables validated in `src/config/env.validation.ts`; never hard-code them.
