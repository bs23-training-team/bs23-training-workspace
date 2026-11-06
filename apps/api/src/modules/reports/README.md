# API module: `reports`

**Owner:** E08 · **Requirements:** SRS REPORT-01–05, PDF-01, MAIL-01–04 · PRD US25–US28

Weekly/Monthly/Full period reports (ten areas), report-copy versions, snapshots, editable PDF, internal mail composer and delivery.

## Suggested layout

```
reports/
├── reports.module.ts          # ReportsModule: add it to `imports` in src/app.module.ts
├── reports.controller.ts      # HTTP routes (thin: validate input, call the service)
├── reports.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── reports.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { ReportsService } from './reports.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
