# API module: `growth-core`

**Owner:** E09 · **Requirements:** SRS GROW-01–02 · PRD US29–US30

XP ledger and rules, levels, streaks and private freezes, badges, review/adjust/reverse with audit. The only module that writes awards.

## Suggested layout

```
growth-core/
├── growth-core.module.ts          # GrowthCoreModule: add it to `imports` in src/app.module.ts
├── growth-core.controller.ts      # HTTP routes (thin: validate input, call the service)
├── growth-core.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── growth-core.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { GrowthCoreService } from './growth-core.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
