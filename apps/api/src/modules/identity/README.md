# API module: `identity`

**Owner:** E01 · **Requirements:** SRS AUTH-01–03, ACCOUNT-01 · PRD US01, US02, US34

Login, PM signup, sessions, sign-out, password/recovery, current user (`/me`), account and photo.

## Suggested layout

```
identity/
├── identity.module.ts          # IdentityModule: add it to `imports` in src/app.module.ts
├── identity.controller.ts      # HTTP routes (thin: validate input, call the service)
├── identity.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── identity.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { IdentityService } from './identity.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
