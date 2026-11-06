# API module: `attendance`

**Owner:** E07 · **Requirements:** SRS ATT-01–03, LEAVE-01 · PRD US22–US24

ERP and Teams attendance adapters and sync, identity mapping, leave requests and decisions, approved-leave events.

## Suggested layout

```
attendance/
├── attendance.module.ts          # AttendanceModule: add it to `imports` in src/app.module.ts
├── attendance.controller.ts      # HTTP routes (thin: validate input, call the service)
├── attendance.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── attendance.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { AttendanceService } from './attendance.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
