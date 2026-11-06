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

Create your file when your data model (`docs/data-model/<module>.md`) is approved.

## Rules

- Edit **only your own file**. Relations to another module's model are fine
  (e.g. `trainee TraineeProfile @relation(...)`), but changing their model needs their review.
- Every domain model has `workspaceId`, `createdAt`, `updatedAt` (SRS p.8).
- Use `@@unique` for the uniqueness rules in the SRS, and `@@index` on fields you filter by.
- Never cascade-delete historical evidence (`onDelete: Restrict` is the safe default).
- One migration per PR. Read `CONTRIBUTING.md` section 5 before creating one.

## Commands (run from the repo root)

```bash
pnpm db:generate                     # regenerate the TypeScript client after editing a .prisma file
pnpm db:validate                     # check the schema is valid
pnpm db:migrate --name catalog_init  # create + apply a migration to your LOCAL database
pnpm db:studio                       # browse your local data in the browser
```
