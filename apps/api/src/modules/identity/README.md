# API module: `identity`

**Owner:** E01 · **Requirements:** SRS AUTH-01–03, ACCOUNT-01 · PRD US01, US02, US34

Login, PM signup, sessions, sign-out, password/recovery, current user (`/me`), account and photo.

## Suggested layout

```
identity/
├── identity.module.ts          # IdentityModule: already registered in src/app.module.ts
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

## Authenticated request user (`req.user`)

`JwtAuthGuard` verifies the access token and the live session, then sets `req.user` on the request.
Other modules read the caller's identity from `req.user` and from nothing else (never from headers,
query or body; no `req.user` means 401).

```ts
{
  sub: string;                  // authenticated account ID: Pm.pmId (PM) or User.userId (USER)
  sid: string;                  // ID of the current Session (the one this access token belongs to)
  workspaceId: string;          // the account's workspace
  role: 'PM' | 'USER';         // PM = the Pm table; USER = any User (all four resource types)
}
```

- The type is `AuthUserPayload` in `types.ts`; routes receive it as `AuthenticatedRequest`.
- All four fields are loaded from the database on every request (session, then its owner). The
  `role` and `workspaceId` claims inside the token are never used for authorisation.
- The role is not a column: it is the table the account lives in. `USER` is the login role of
  every `User` (it was called TRAINEE before 2026-11-25); the resource type (TRAINEE, CENTRAL_RND, INDUSTRIAL_ATTACHMENT, SBU) stays in
  `User.resource`.
- Protect a route with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles('PM')` or `@Roles('USER')`.
