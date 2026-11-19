# ADR 0002: Module Layering (MVC) for API and Web

| Field | Value |
|---|---|
| Status | **Proposed**: awaiting review by E01 (architecture owner), E10 and the mentor |
| Date | 2026-11-11 |
| Author | E11 (DevOps) |
| Deciders | E01, E10, E11, all module owners E02–E09 |
| Related | [ADR 0001](0001-monorepo-structure.md), [repo-structure](../repo-structure.md), SRS p.9 (NestJS owns authority) |

## 1. Context

Ten people write code in parallel, each owning one module. ADR 0001 decided *where* a module's
files live. It did not decide *how the code inside a module is layered*. Without a shared
layering, ten modules will look like ten different projects, reviews will take longer, and
business rules will leak into controllers or into the web app (the SRS forbids this: NestJS
owns permissions, scores, deadlines, approvals and XP).

## 2. Decision

We use MVC with NestJS and Next.js. No `models/`, `views/` or `controllers/` top-level folders
are created. The layers map onto what the repo already has:

| MVC | Where it lives | Responsibility |
|---|---|---|
| Model | `apps/api/prisma/schema/*.prisma`, `PrismaService`, optional `<module>.repository.ts` | Data shape and data access |
| Controller | `apps/api/src/modules/<m>/<m>.controller.ts` | HTTP in/out only |
| Business logic | `apps/api/src/modules/<m>/<m>.service.ts` | The rules of the module |
| View | `apps/web/src/features/<f>/` and `apps/web/src/app/` | What the user sees |
| Contract | `packages/contracts/src/<m>/` | Types shared by API and web |

Dependency direction (an arrow means "may call"):

```
web view ──HTTP──▶ controller ──▶ service ──▶ repository / PrismaService ──▶ database
                       │             │
                       └─ contracts ─┘   (types only, no logic)
```

## 3. Rules

1. **Controllers are thin.** A controller validates input, calls one service method and returns
   the result. No business rules, no Prisma.
2. **Services own the rules.** A service does not use `req`/`res` or know about HTTP. It returns
   data or throws a domain error; the controller turns that into an HTTP response.
3. **Prisma stays below the controller.** `PrismaService` is injected only in services or
   repositories. Never in controllers, never in `apps/web`.
4. **The web view has no business rules.** `apps/web` shows data and sends user actions to the
   API. Next.js Server Actions / route handlers may only proxy (SRS p.9).
5. **Modules talk through exports.** To use another module's data, import its module and call its
   exported service, or use an outbox event. Never import another module's files directly and
   never write to its tables (growth-core is the only module that writes awards).
6. **Shared shapes go to `packages/contracts`.** If both web and API need a type, it lives in
   `packages/contracts/src/<module>/` and is re-exported from `src/index.ts`.

## 4. Layout of one module

```
apps/api/src/modules/<m>/
├── <m>.module.ts
├── <m>.controller.ts
├── <m>.service.ts
├── <m>.repository.ts      # optional: only when queries get long or reused
├── <m>.service.spec.ts    # unit tests: mock PrismaService / repository
└── dto/                   # request classes; shared response types go to contracts

apps/web/src/features/<f>/
├── components/            # UI
├── hooks/                 # data fetching and UI state
├── api.ts                 # the only place that calls the API
└── types.ts               # re-export types from @bs23/contracts
```

Create files only when needed. A small module may have no repository and no `dto/` yet.

## 5. Reference implementation

`apps/api/src/health/` is the reference: `health.controller.ts` (HTTP only),
`health.service.ts` (the check), `health.module.ts` and a spec for each of the two classes.
Copy its shape when starting a module.

## 6. Enforcement

- Code review: reviewers check the six rules; E11 is a required reviewer on `packages/contracts`.
- Planned (not done yet): an `oxlint` restriction so files named `*.controller.ts` cannot import
  `PrismaService`, and an import check that `apps/web` never imports from `apps/api`.
  Until then the rules rely on review.

## 7. Consequences

- (+) Every module has the same shape, so reviewing and moving between modules is easier.
- (+) Services are easy to unit test because they do not depend on HTTP.
- (−) Small features need a few more files than a single-file approach.
- (−) Rules without lint enforcement can drift; this is accepted until the lint step is added.

## 8. Changelog

- 2026-11-11: first draft.
