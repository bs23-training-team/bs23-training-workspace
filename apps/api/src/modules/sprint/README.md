# API module: `sprint`

**Owner:** E06 · **Requirements:** SRS SPRINT-01–03, MEET-01, QUALITY-01 · PRD US19–US21

Daily tasks, team-first sheet with seven-day week tabs, cell versions and conflicts, DS meetings, SonarQube/code quality.

## Suggested layout

```
sprint/
├── sprint.module.ts          # SprintModule: add it to `imports` in src/app.module.ts
├── sprint.controller.ts      # HTTP routes (thin: validate input, call the service)
├── sprint.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── sprint.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { SprintService } from './sprint.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
