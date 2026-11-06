# API module: `directory`

**Owner:** E02 · **Requirements:** SRS DIR-01–05 · PRD US04–US06

Trainees, teams, memberships, full name-click evaluation profile (ten cards), onboarding Day count, L&D feedback versions.

## Suggested layout

```
directory/
├── directory.module.ts          # DirectoryModule: add it to `imports` in src/app.module.ts
├── directory.controller.ts      # HTTP routes (thin: validate input, call the service)
├── directory.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── directory.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { DirectoryService } from './directory.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
