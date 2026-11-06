# Week 1 Team Brief

**For:** E01–E11 · **Based on:** PRD v3.2, SRS v3.2, Build Order Plan v3.2 (UI baseline v19)
**Prepared by:** E11 (DevOps)

Read this before writing any feature code. It summarizes what the requirement documents ask
from each of us in the first week, plus the repository rules that make it work.

---

## 0. Read first (everyone)

1. `BS23_Final_PRD_EN_v19.pdf`: what we build (epics and user stories)
2. `BS23_Final_SRS_EN_v19.pdf`: technical rules and acceptance tests (T01–T20)
3. `BS23_Final_Build_Order_Plan_EN_v19.pdf`: who builds what, in which order
4. [docs/setup.md](setup.md): get the project running on your machine
5. [CONTRIBUTING.md](../CONTRIBUTING.md): branches, PRs, migrations, secrets

> The v19 HTML/Worker prototype is a **UI reference only**. We do not copy its storage, auth or
> mail code. The production app is Next.js + NestJS + Prisma + PostgreSQL.

---

## 1. ⚠ Important: there is no "merge all databases at the end"

Some of us assumed each member builds a separate database and E10 merges them at the end.
**The documents say the opposite:**

- **One Prisma schema and one migration history, from day one** (SRS p.8, Build Plan p.9).
- *"Coordinate shared schema changes; do not create eleven competing migration histories."*
  (Build Plan p.10)
- **Every owner writes their own models** inside the shared schema, in their own file:
  `apps/api/prisma/schema/<module>.prisma`.
- **E01** owns the shared architecture, identity and the shared data-model review.
- **E11** sets up the Prisma tooling and runs migrations on staging/production through the
  pipeline. E11 does not write everyone's business models (Build Plan p.2).
- **E10 is a full-stack module owner** like everyone else (quests, leaderboards, hackathons,
  kudos). E10 also supports **shared UI components and integration fixtures**. E10 is *not*
  the person who merges or fixes everyone's modules at the end. *"Domain owners remain
  responsible for their own bugs"* (Build Plan p.2, p.8).

**Why:** if 10 people build separately and merge in Week 9, IDs, relations and migrations
will not fit together, and there will be no time to fix it. Integrating small pieces every
day is how the plan avoids that.

---

## 2. First five days (Build Plan p.3)

| Day | Who | Required output |
|---|---|---|
| 1 | All | Read PRD/SRS/Build Plan. Map E01–E11 to real names. |
| 1 | E01 + E11 | Confirm pinned stack versions and repo/session approach. Request provider access (AI, ERP/Teams, Sonar, mail sender, file storage). |
| 2 | E01 | Identity / workspace scope / API error format / notification envelope |
| 2 | E02 | Trainee, team and profile IDs |
| 2 | E03 | Question / rubric / attempt / result contract |
| 2 | E04 | Initial course / version / skill IDs |
| 2 | E05 | Learning-state and exam-launch contracts |
| 3 | E06 | Task / sheet / meeting / quality DTOs |
| 3 | E07 | Source (ERP/Teams) and leave DTOs |
| 3 | E08 | Report / snapshot schema and all-source fixtures |
| 3 | E09 | Reward key / status contract |
| 3 | E10 | Engagement entities and shared components |
| 4 | Owners + E01 | Shared data model documented and reviewed. First Prisma migrations applied to an isolated PostgreSQL. |
| 4 | E11 | Locked builds, CI and staging skeleton |
| 5 | All | Demo: PM creates trainee → trainee signs in. Verify IDs/access/fixtures across modules. Re-estimate workload. |

**What "contract" means:** a written agreement of the IDs, fields and shapes other modules
will use from you, *before* the full feature exists. Others build against your contract and
fixtures (fake sample data) instead of waiting for you.

---

## 3. How to deliver your Day 2–3 contract

Each owner opens **one PR** containing:

1. `docs/data-model/<module>.md`: your data model, using
   [docs/data-model/_TEMPLATE.md](data-model/_TEMPLATE.md)
2. (after E11 creates `packages/contracts`) your shared TypeScript types in
   `packages/contracts/src/<module>/`

Reviewers: **E01** (always) + every owner whose module you reference or who consumes your events.

Do **not** write Prisma migrations before the Day 4 review. On Day 4, after review, each owner
adds `apps/api/prisma/schema/<module>.prisma` and E01 + E11 review the first migration together.

---

## 4. Who sends what to whom (Build Plan p.6, SRS p.10)

| Producer | Consumer | What |
|---|---|---|
| E03 | E04, E05, E08, E09 | Results / recommendations (must use **E04 catalog IDs**); final assessment → eligible XP |
| E04 | E03, E05 | Catalog / course / skill IDs, entitlements |
| E05 | E09, E08 | Verified learning events, progress |
| E06 | E09, E08 | Daily submission / project review → reward review; sprint data |
| E07 | E09, E08 | Approved leave → private streak freeze; attendance |
| E10 | E09 | Quest / hackathon / kudos **award requests** (E10 never writes XP directly) |
| E09 | E08, E10 | Awarded ledger / reward status |
| E02 | E03–E09, E08 | Trainee / team / onboarding / L&D feedback |
| **Everyone** | E01 | Notifications through E01's recipient-scoped notification / outbox interface |

**Single-authority rules (do not duplicate):** E03 alone grades. E04 owns catalog/access,
not grading. E09 alone writes rewards. E08 edits report copies, never source grades.
NestJS owns all business rules. Next.js only displays and forwards.

---

## 5. Do NOT build these (removed in v19)

GitHub Evidence (both roles) · PM Connect repository · trainee self-signup · role tabs ·
standalone Assessments sidebar · PM learner exam / video progress · PM personal attendance /
Reconciliation / late display · **Your trainees** and **Workspace shortcuts** dashboard
sections · **Trainee actions / What's next?** profile panel · **four-link Reports shortcut
block** · repeated report cards · trainee Integrations / UI states / Connected tools ·
automatic course assignment · model training · cash rewards · new roles.

**v19 changes by owner (Build Plan p.11):**
- **E01:** PM dashboard = All Users, Skill reports, Course requests, Leave requests work cards + Needs your attention.
- **E02:** Name click → personal/training info + **ten evaluation cards** (initial, course results, skills, learning, sprint, attendance, professionalism, PM feedback, gamification, profile/L&D). No side panel.
- **E08:** Remove only the four shortcut links. Keep all ten report areas, charts, periods, Edit report, Make PDF, Email report.

Removing a UI element never means deleting its data or capability.

---

## 6. Open decisions (do not invent answers)

| Decision | Who chases it |
|---|---|
| Policy content and view/edit permissions | E01 / E02 with PM |
| Real content of the 50 starting courses | E04 with PM |
| Rubrics / attempt rules | E03 with PM |
| XP / cutoff / kudos rules | E09 / E10 with PM |
| Hosting, background jobs, file storage | E11 |
| AI, ERP/Teams, Sonar, mail sender permissions | E11 coordinates, module owners specify needs |
| Retention, recovery and load targets | E11 with PM |

If your work depends on one of these, build against a clearly labelled fixture and keep the
gap visible. Do not quietly fill it in.

---

## 7. A module is "done" when (Build Plan p.10)

- Reviewed schema / migration
- Scoped APIs and DTOs (role + workspace + record access checked)
- Connected Next.js UI with loading / empty / error / conflict states
- Durable, versioned state and events (no in-memory-only events)
- Meaningful tests
- Short handoff documentation
- CI green and staging acceptance passed

A green build or a convincing prototype screen is **not** "done".

---

## 8. What E11 provides this week

- ✅ Repository, branch rules, monorepo skeleton (`apps/web`, `apps/api`), local Postgres 18 + Redis
- ✅ `docs/setup.md`, `CONTRIBUTING.md`, PR template, CODEOWNERS
- ⏳ Prisma tooling with the per-module schema folder
- ⏳ `packages/contracts` and `packages/ui` skeletons
- ⏳ CI (install → lint/types → Prisma validate → tests → build) on every PR
- ⏳ Neon staging + first skeleton deploy
- ⏳ Provider access request list sent to the PM/mentor

**What E11 needs from you:** your GitHub username today, any new environment variable your
module needs (in your PR), and which external providers your module needs (E03: AI; E06: Sonar;
E07: ERP/Teams; E08: mail sender and file storage).
