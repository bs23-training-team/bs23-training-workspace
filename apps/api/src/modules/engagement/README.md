# API module: `engagement`

**Owner:** E10 · **Requirements:** SRS GROW-03–05 · PRD US31–US33

Weekly quests, leaderboards with opt-out, hackathons, kudos with caps/cooldown. Requests awards from growth-core, never writes XP directly.

## Suggested layout

```
engagement/
├── engagement.module.ts          # EngagementModule: add it to `imports` in src/app.module.ts
├── engagement.controller.ts      # HTTP routes (thin: validate input, call the service)
├── engagement.service.ts         # business rules (uses PrismaService)
├── dto/                      # request/response classes; shared shapes go to packages/contracts
└── engagement.service.spec.ts    # tests (Vitest)
```

## Rules

- Business rules live here, not in `apps/web` (SRS: NestJS owns authority).
- Check role, workspace and record access on every route.
- Talk to another module only through its exported service or an outbox event, never by writing
  to its tables.
- Imports between our own files end in `.js` (ESM): `import { EngagementService } from './engagement.service.js';`
- Database models for this module: your section in `apps/api/prisma/schema/` (see its README).
