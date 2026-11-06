# API module: `dashboard`

**Owner:** E01 · **Requirements:** SRS UI-01, UI-03 · PRD US03

PM dashboard (All Users, Skill reports, Course requests, Leave requests work cards + Needs your attention) and the personal trainee dashboard.

## Suggested layout

```
dashboard/
├── dashboard.module.ts          # DashboardModule: add it to `imports` in src/app.module.ts
├── dashboard.controller.ts      # HTTP routes (thin: validate input, call the service)
├── dashboard.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── dashboard.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { DashboardService } from './dashboard.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
