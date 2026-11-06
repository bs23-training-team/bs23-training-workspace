# API module: `learning`

**Owner:** E05 · **Requirements:** SRS LEARN-01–03 · PRD US16–US18

Learning Roadmap: entitled courses, lessons, per-trainee topic state (Learning / Mark as done / Skip), progress. Mounts E03 exams.

## Suggested layout

```
learning/
├── learning.module.ts          # LearningModule: add it to `imports` in src/app.module.ts
├── learning.controller.ts      # HTTP routes (thin: validate input, call the service)
├── learning.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── learning.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { LearningService } from './learning.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
