# API module: `outbox`

**Owner:** E01 · **Requirements:** SRS SRS Data & contracts (outbox) · PRD —

Shared event foundation: domain state and its event are saved in one transaction; consumers deduplicate.

## Suggested layout

```
outbox/
├── outbox.module.ts          # OutboxModule: add it to `imports` in src/app.module.ts
├── outbox.controller.ts      # HTTP routes (thin: validate input, call the service)
├── outbox.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── outbox.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { OutboxService } from './outbox.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
