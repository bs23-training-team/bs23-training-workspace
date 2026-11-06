# API module: `assessment`

**Owner:** E03 · **Requirements:** SRS INIT-01–06, AI-01–05, EXAM-01–04 · PRD US07–US12, US18

Expertise survey, initial test and retest, course exams engine, AI evaluation adapter, results, appeals, catalog-only recommendations.

## Suggested layout

```
assessment/
├── assessment.module.ts          # AssessmentModule: add it to `imports` in src/app.module.ts
├── assessment.controller.ts      # HTTP routes (thin: validate input, call the service)
├── assessment.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── assessment.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { AssessmentService } from './assessment.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
