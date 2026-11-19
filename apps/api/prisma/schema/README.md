# Prisma schema

All models live in **one file**: `schema.prisma`. Prisma reads every `.prisma` file in this folder
as one schema, so the folder has only these files:

| File | Owner | Contents |
|---|---|---|
| `base.prisma` | E11 | generator + datasource only. No models here. |
| `schema.prisma` | E11 (combined from the E01–E10 drafts) | every model and enum, one section per module |

The migration history is in `../migrations`. The first migration, `*_init`, was merged on
2026-11-19 (PR #12). It also contains hand-written SQL at the end (CHECK constraints, partial
unique indexes, triggers) for the rules marked `// DB:` in `schema.prisma`.

Do not create new `.prisma` files. Ask E11 if you think one is needed.

## Sections in `schema.prisma`

| Section | Module | Main models |
|---|---|---|
| E01 · identity | E01 | Workspace, Pm, User, Credential, AuthToken, Session, Notification, OutboxEvent, Integration |
| E02 · directory | E02 | UserSkill, Team, Membership, FeedbackVersion |
| E03 · assessment | E03 | Skill, QuestionSet, Question, ExpertiseVersion, Attempt, Response, Appeal, RetakeRequest |
| E04 · catalog | E04 | Course, CourseModule, LessonContent, CourseAssignment, CourseRequest |
| E05 · learning | E05 | LearnerTopicState, LessonProgress, CompletionEvent |
| E06 · sprint | E06 | TaskOwner, SprintTask, SprintSubmission, SprintWeek, DsSheetCell, DsMeeting |
| E07 · attendance | E07 | IdentityMapping, Attendance, MeetingAttendance, PublicHoliday, LeaveRequest |
| E08 · reports | E08 | Report, ReportVersion, ReportFile, MailDelivery |
| E09 · growth-core | E09 | XpRule, Level, XpEvent, Streak, Badge, BadgeAward |
| E10 · engagement | E10 | Quest, QuestProgress, LeaderboardPreference, Kudos |

## Rules

- Change **only your own section**. A relation to another module's model is fine, but it also adds
  a back-relation field in their section: tell them in the PR.
- Every model has `workspaceId` (with a relation to `Workspace`), `createdAt` and `updatedAt`.
- Every relation uses `onDelete: Restrict`. Never `Cascade`: history is never deleted.
- A list field (`Something[]`) needs a matching `@relation(fields: [...], references: [...])` on the
  other side. Without it Prisma silently creates a hidden join table.
- Add `@@index` on a foreign key you will filter by. Prisma does not index foreign keys by itself.
- A rule Prisma cannot express (CHECK, partial unique index) is written as a `// DB:` comment, and
  its SQL goes at the end of your migration's `migration.sql`.
- `Pm.pmId` (e.g. `PM002`) and `User.userId` (e.g. `BS23001`) are primary keys and never change.
  See [ADR 0003](../../../../docs/adr/0003-login-ids-as-primary-keys.md).
- Read `CONTRIBUTING.md` section 5 before creating a migration.

## How to change the schema (example: E04 adds a column)

1. Start from the latest `develop`:
   ```bash
   git checkout develop
   git pull
   git checkout -b feat/e04-course-level
   pnpm install
   pnpm infra:up
   pnpm db:deploy
   ```
2. Edit your section of `schema.prisma`, then check it:
   ```bash
   pnpm db:validate
   pnpm --filter api exec prisma format
   ```
3. Create the migration without applying it, and read the SQL:
   ```bash
   pnpm db:migrate --name course_level --create-only
   ```
   Open the new `migrations/*_course_level/migration.sql`. It must not contain `DROP`,
   `ON DELETE CASCADE` or `CREATE TABLE "_` (a hidden join table). Add any `// DB:` SQL at the end.
4. Apply it and regenerate the client:
   ```bash
   pnpm db:migrate
   pnpm db:generate
   ```
5. Commit **both** `schema.prisma` and the new migration folder, then open a PR to `develop`.
   E11 reviews every schema PR. Wait for the CI check to be green.
   ```bash
   git add apps/api/prisma
   git commit -m "feat(catalog): add level to Course"
   git push -u origin feat/e04-course-level
   ```

### If someone else merged a migration before you

Your migration must come **after** theirs, so recreate it:

```bash
git fetch origin
git rebase origin/develop
rm -rf apps/api/prisma/migrations/*_course_level
pnpm db:migrate --name course_level
git add apps/api/prisma
git commit -m "feat(catalog): regenerate migration after rebase"
git push --force-with-lease
```

If Prisma asks to reset your **local** database, answer yes (it only deletes your local test data).
CI fails when the schema and the migrations do not match, so this mistake is caught before merge.

## Commands (run from the repo root)

```bash
pnpm db:validate        # check the schema is valid
pnpm db:generate        # regenerate the TypeScript client (needed after every pull with schema changes)
pnpm db:deploy          # apply the merged migrations to your local database
pnpm db:migrate --name <reason> --create-only   # create a new migration without applying it
pnpm db:migrate         # apply pending migrations to your LOCAL database
pnpm db:status          # show which migrations are applied
pnpm db:seed            # add demo data: 2 PMs, 4 users, 1 team (local/test only, safe to re-run)
pnpm db:studio          # browse your local data in the browser
```
