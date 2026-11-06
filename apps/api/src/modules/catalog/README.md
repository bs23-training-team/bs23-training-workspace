# API module: `catalog`

**Owner:** E04 · **Requirements:** SRS COURSE-01–03 · PRD US13–US15

50-course catalog, course versions/topics/resources, Add course, assignments, course requests and approvals.

## Suggested layout

```
catalog/
├── catalog.module.ts          # CatalogModule: add it to `imports` in src/app.module.ts
├── catalog.controller.ts      # HTTP routes (thin: validate input, call the service)
├── catalog.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── catalog.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { CatalogService } from './catalog.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
