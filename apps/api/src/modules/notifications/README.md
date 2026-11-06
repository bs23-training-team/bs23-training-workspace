# API module: `notifications`

**Owner:** E01 · **Requirements:** SRS NOTI-01 · PRD US03

Recipient-scoped bell notifications: unread/read, mark-all-read, record links. Every module sends notifications through this module.

## Suggested layout

```
notifications/
├── notifications.module.ts          # NotificationsModule: add it to `imports` in src/app.module.ts
├── notifications.controller.ts      # HTTP routes (thin: validate input, call the service)
├── notifications.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── notifications.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { NotificationsService } from './notifications.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
