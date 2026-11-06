# Prisma schema (one schema, many files)

Prisma reads **every `.prisma` file in this folder** as one schema. There is one shared
migration history in `../migrations`. There are no per-person databases.

| File | Owner | Contents |
|---|---|---|
| `base.prisma` | E01 + E11 | generator + datasource only |
| `identity.prisma` | E01 | User, Workspace, Session, Notification, OutboxEvent… |
| `directory.prisma` | E02 | TraineeProfile, Team, Membership, L&D feedback… |
| `assessment.prisma` | E03 | Expertise, questions, attempts, results, appeals… |
| `catalog.prisma` | E04 | Course, CourseVersion, Topic, Assignment, Request… |
| `learning.prisma` | E05 | LearnerTopicState, LessonProgress… |
| `sprint.prisma` | E06 | Task, Submission, SheetCellVersion, DSMeeting… |
| `attendance.prisma` | E07 | IdentityMapping, Attendance, LeaveRequest… |
| `reports.prisma` | E08 | ReportDraftVersion, Snapshot, MailDelivery… |
| `growth-core.prisma` | E09 | XPRule, XPEvent, Streak, Badge… |
| `engagement.prisma` | E10 | Quest, Hackathon, Kudos, LeaderboardPreference… |

Every file already exists and is **empty on purpose**. Add your models only after your data model
(`docs/data-model/<module>.md`) is approved by E01 (Day 4). Do not create new `.prisma` files;
ask E01 + E11 if you think one is needed.

## Rules

- Edit **only your own file**. Relations to another module's model are fine
  (e.g. `trainee TraineeProfile @relation(...)`), but changing their model needs their review.
- Every domain model has `workspaceId`, `createdAt`, `updatedAt` (SRS p.8).
- Use `@@unique` for the uniqueness rules in the SRS, and `@@index` on fields you filter by.
- Never cascade-delete historical evidence (`onDelete: Restrict` is the safe default).
- One migration per PR. Read `CONTRIBUTING.md` section 5 before creating one.

## How to add your models (example: E04)

**Order matters:** E01 (`User`, workspace) and E02 (`TraineeProfile`, `Team`) merge first, because
almost every other model points to them.

1. Start from the latest `develop` and start the local database:
   ```bash
   git checkout develop && git pull
   git checkout -b feat/e04-catalog-schema
   pnpm infra:up
   ```
2. Write your models in **your** file, using your approved data model doc:
   ```prisma
   model Course {
     id          String   @id @default(uuid())
     workspaceId String
     title       String
     track       String
     description String
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt

     @@unique([workspaceId, title])
     @@index([workspaceId])
   }
   ```
   A relation to another module's model (e.g. `trainee TraineeProfile @relation(...)`) also adds the
   back-relation field in **their** file. Add them as a reviewer.
3. Check it and create the migration on your local database:
   ```bash
   pnpm db:validate
   pnpm db:migrate --name catalog_init
   pnpm db:studio        # optional: look at the tables in the browser
   ```
4. Commit **both** your `.prisma` file and the new folder in `prisma/migrations/`, then open a PR:
   ```bash
   git add apps/api/prisma/
   git commit -m "feat(catalog): add Course model"
   git push -u origin feat/e04-catalog-schema
   ```
   E01 + E11 review every schema PR (CODEOWNERS).

### If someone else merged a migration before you

Your migration must come **after** theirs, so recreate it:

```bash
git fetch origin
git rebase origin/develop
rm -rf apps/api/prisma/migrations/*_catalog_init
pnpm db:migrate --name catalog_init
git add apps/api/prisma/
git commit -m "feat(catalog): regenerate migration after rebase"
git push --force-with-lease
```

If Prisma asks to reset your **local** database, answer yes (it only deletes your local test data).
CI fails when the schema and the migrations do not match, so this mistake is caught before merge.

## Commands (run from the repo root)

```bash
pnpm db:generate                     # regenerate the TypeScript client after editing a .prisma file
pnpm db:validate                     # check the schema is valid
pnpm db:migrate --name catalog_init  # create + apply a migration to your LOCAL database
pnpm db:studio                       # browse your local data in the browser
```
