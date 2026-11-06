# BS23 Training Workspace: Final PRD

**Product Requirements Document · Version 3.2 · UI baseline v19 · 5 November 2026**
Beginner-friendly English · Epics and User Stories
Working calendar: Asia/Dhaka · Companion: [SRS](srs.md)

> Markdown copy of `BS23_Final_PRD_EN_v19.pdf`. The PDF is the source of truth. If this file and the
> PDF ever differ, follow the PDF and tell E11 so this copy can be fixed.

This product brings PM-managed training and the trainee learning journey into one workspace. The PM
provisions people, reviews skills, assigns learning, manages work and attendance, and sends complete
evaluations. Trainees assess their skills, learn, submit work, request courses/leave and follow feedback.

**How to read this document**

- **Epic:** a major area of work.
- **User story:** who needs something, what they need and why.
- **PRD:** the product outcomes and scope. The separate SRS defines the technical rules and tests.

**Confirmed stack:** Next.js + TypeScript frontend; NestJS + TypeScript backend; PostgreSQL on Neon; Prisma ORM.

**Scope authority:** the approved chat requirements, the final 11-member allocation screenshot and
subsequent corrections. Newer instructions override older screenshots. This revision preserves the
approved project scope and incorporates published UI v19 (commit `c19525d1006b315a3c6b8953f6ec1bbc14e6df95`).

**Implementation status:** the existing HTML/Worker prototype establishes UX intent. Browser-local
previews are not completed production authentication, shared database, AI, ERP/Teams, SonarQube or
email integration.

**Success:** the trainee knows the next learning/work step; the PM knows what requires review. Content
progress, assessed competence, attendance, engagement and human feedback remain distinct.

Reference workspace: `bs23-training-workspace-brishty.stillpenny2.chatgpt.site`

---

## Product overview: two roles, one connected journey

| Role | Responsibility and access |
|---|---|
| PM | Own account signup; manage authorized trainees/teams, assignments, leave, engagement and reports. No learner exam or personal watch tracking. |
| Trainee | PM-provisioned login; own assessment, learning, work, requests and private reports; permitted public engagement information only. |

There is no third Admin or L&D login role. L&D feedback is a PM-authorized human review function.

**Main journey:** PM account → trainee/team creation → trainee expertise and test → shared skill report →
catalog-only suggestions → PM assignment → trainee learning/exams → daily work and attendance →
engagement → period report → editable PDF and email.

| PM navigation | Trainee navigation |
|---|---|
| Dashboard | Dashboard |
| All Users / full trainee profile | Skill Analysis, including retest |
| Reports | Reports |
| Daily Sprints | Daily Sprint |
| Courses & Assignments | Learning Roadmap |
| Attendance | ERP |
| Gamification | Gamification |
| Settings (Account/Notifications) | Profile & Settings |
| Policy (detailed scope pending) | No integrations/tools/UI-state menus |

Dashboard work cards and evaluation-card controls open the corresponding workspace destination with
trainee/team context. Reports has no four-link shortcut block; its complete document and export/email
controls remain. Bell notifications are user-scoped. Only an explicit report-mail action sends external email.

**Design:** approved dark navy and violet workspace, compact branding, real bell, simple language,
accessible dialogs and responsive controls. Reports may use white document surfaces for legibility.

---

## Epics and user stories

### Epic 01: Common login, dashboards and notifications

**Outcome:** Help each person reach the right work from one shared entry point.

- **US01 (PM)** As a PM, I want to create my account and sign in so that I can manage training.
- **US02 (Trainee)** As a trainee, I want to use PM-provided credentials and complete first-login evaluation before entering my workspace.
- **US03 (Both)** As a user, I want clear dashboards and contextual notifications so that I can open the next task directly.

Requirements:

- One login without role-selection tabs; server-resolved PM or trainee access. PM-only signup, secure account/password/recovery actions and sign-out.
- PM dashboard: All Users, Skill reports, Course requests and Leave requests work cards plus Needs your attention. Cards open relevant queues. No Your trainees or Workspace shortcuts sections. Trainee dashboard stays personal.
- Dark navy/violet design, compact BS23 branding and a real bell. No former demo/role badges, ambiguous PM learning chart/average or PM personal video/exam progress.
- Notifications support unread/read, mark-all-read and correct record links. In-app notifications do not automatically send external email.

### Epic 02: Trainee directory, teams and full profiles

**Outcome:** Give the PM a complete, organized view of each trainee.

- **US04 (PM)** As a PM, I want to create a trainee with a team and L&D onboarding date so that training records start correctly.
- **US05 (PM)** As a PM, I want a trainee name click to open a complete evaluation profile with organized information and evaluation boxes.
- **US06 (Both)** As a user, I want the correct person's skills, learning, results, attendance and feedback to remain connected.

Requirements:

- Create/edit ID, name, email, temporary password, position, Online/Physical mode, required team dropdown and required onboarding date. No related-skills field in Add trainee.
- All Users retains search, position/mode/skill filters and five-row pagination; identity, team, mode, skills, onboarding-to-today, assigned progress, 14-day work summary, attendance and L&D context.
- Name opens personal/training information and ten evaluation boxes. Contextual evaluation controls remain; no Actions column and no separate Trainee actions / What's next? panel. Profile edits and course assignment remain in their existing authorized flows.
- Both roles see onboarding-to-today and inclusive day count. L&D feedback preserves author/time/history; it remains separate from AI scores and edited report copies.

### Epic 03: Expertise onboarding, initial assessment and retesting

**Outcome:** Separate claimed skills from demonstrated skills and let trainees update their evidence.

- **US07 (Trainee)** As a trainee, I want questions based on my technical background so that my starting skills can be assessed.
- **US08 (Both)** As a user, I want the same saved skill report showing strengths, gaps, evidence and learning needs.
- **US09 (Trainee)** As a trainee, I want Again test your skill so that new skills can be assessed without losing earlier results.

Requirements:

- Required expertise survey: joining role, technologies, experience, confidence, improvement interests and goals; custom Other details where required. Declared role does not overwrite PM-assigned position.
- Reviewed questions selected by supported technology and level, objective answers plus practical explanation. Self-confidence never adds marks; unsupported skills stay unassessed.
- Report includes score/total, assessed level, known concepts, weaknesses, unassessed skills, evidence, practical-review status, goals and recommendations. Trainee Skill Analysis and PM share the report.
- Retest creates a new expertise/attempt/result version and PM notification. Keep history; refresh recommendations without automatically changing existing assignments. No extra PM-approval lock after initial completion.

### Epic 04: AI evaluation and catalog-only recommendations

**Outcome:** Use AI to explain evidence and suggest suitable learning; keep assignment decisions with the PM.

- **US10 (PM)** As a PM, I want applicable catalog courses with reasons based on the trainee's skill report.
- **US11 (Trainee)** As a trainee, I want to understand my gaps and improvement priorities.
- **US12 (PM)** As a PM, I want Skills analysis to open Courses & Assignments filtered to that trainee's suitable courses.

Requirements:

- Connect an existing AI API through the backend; no new model training or fine-tuning. Backend scores objective answers; rubric-based AI assists practical/written/code review.
- Start with 50 curated courses. Suggestions use valid available catalog courses only, including eligible PM additions later. AI does not invent or autoassign courses.
- Show trainee identity, gap/evidence, reason, priority and curriculum/roadmap preview. Keep the skill report accessible as well as the filtered course destination.
- Profile-only suggestions are labelled Unassessed. Failed/pending evaluation never produces fake verified marks; AI does not judge professionalism, leave legitimacy or employment suitability.

### Epic 05: PM catalog, assignments and course requests

**Outcome:** Connect course supply with each trainee's learning needs.

- **US13 (PM)** As a PM, I want Add course beside All courses so that I can add curriculum and resources.
- **US14 (PM)** As a PM, I want to assign a course to a trainee or team while preserving learning history.
- **US15 (Trainee)** As a trainee, I want to request a course with a reason and receive the PM's decision.

Requirements:

- PM tabs: Suggested courses, All courses, Assignments and Course requests. Initial 50 courses are a starting catalog, not a permanent maximum.
- Add course includes title, track, description, ordered roadmap topics and optional HTTPS resources. Validate duplicates and preserve published content versions.
- PM previews content and reads trainee results; PM does not take learner exams or track personal video completion. Displayed assignment due dates must be saved.
- Requests move Pending to Approved/Declined; approval grants access and notifies the trainee. Pending requests grant no access; duplicate active requests are blocked.

### Epic 06: Learning Roadmap, lessons and course assessments

**Outcome:** Make personal learning easy to follow and keep completion separate from mastery.

- **US16 (Trainee)** As a trainee, I want assigned/approved courses, lessons and resources with personal progress.
- **US17 (Trainee)** As a trainee, I want Learning, Mark as done and Skip actions on roadmap nodes.
- **US18 (Both)** As a user, I want course assessment results, review status and history from the same official record.

Requirements:

- Trainee navigation is Learning Roadmap, with Assigned/Completed views, filters and Continue/Open. Same curriculum version means the same graph; personal states differ.
- Hover reveals Learning / Mark as done / Skip, also accessible by keyboard and touch. Self-marked or skipped topics do not grant verified mastery or verified-work XP.
- Topic outcomes, prerequisites, subtopics, explanations, examples, pseudocode, resources and previous/next lessons remain. Retain the Full Stack reference graph and practical checkpoints.
- Learner-only exams include instructions, acknowledgement, autosave, server timer, once-only submission, objective/written/code evaluation, provisional/final results, history, revision advice and appeal/review. No standalone Assessments sidebar.

### Epic 07: Daily Sprint, team sheets, meetings and code quality

**Outcome:** Join each trainee's daily work to a team-level PM view.

- **US19 (Trainee)** As a trainee, I want dated tasks, hours, blockers and optional repository links.
- **US20 (PM)** As a PM, I want a team-first Excel-style sheet and new seven-day sprint tabs.
- **US21 (Both)** As a PM, I schedule DS meetings and review project quality; as a trainee, I receive the relevant meeting notification and join link.

Requirements:

- Trainee Yesterday/Today/Blockers/This Week context, task add/edit, category, planned/actual time, start/end and independent completion timestamps/history.
- One sheet per team, not an individual DS file. Trainee/sprint-plan rows and grouped daily yesterday/hours/today/blocker fields; preserve blue spreadsheet headers, scrolling, row/column/formula context and week tabs.
- Add Sprint creates the next seven-day tab without losing previous weeks. Persist cells with saved/unsaved/error and conflict states. Directory drill-in keeps trainee/team context.
- Add new DS meeting uses team/all, title, date, Dhaka time and optional Teams URL. PM-only weekly team reports stay private. Optional task repos and SonarQube Cloud review remain; no GitHub Evidence page or PM Connect repository action.

### Epic 08: Attendance, ERP/Teams and leave

**Outcome:** Show accurate attendance evidence and let the PM decide leave requests.

- **US22 (PM)** As a PM, I want all authorized trainees' attendance and leave requests with date/person filters.
- **US23 (Trainee)** As a trainee, I want my own attendance evidence and leave status.
- **US24 (Both)** As a trainee, I submit leave; as a PM, I approve or decline with a note and notify the trainee.

Requirements:

- PM tabs: ERP attendance, Teams meetings and Leave requests. Remove PM personal attendance boxes, Reconciliation and Late/late-minute display.
- Office entry and DS meeting joins are separate evidence. Unknown checkout is not zero hours; missing source data is not inferred absence. Preserve online-mode, holiday and approved-leave context.
- Trainee ERP retains personal evidence and existing personal reconciliation context. Removing PM late display does not delete source punctuality or personal/report evidence.
- Leave contains type, dates and reason; preserve PM actor/time/note and status. Approved leave privately freezes streaks without rewriting official attendance.

### Epic 09: Comprehensive reports, editable PDF and internal email

**Outcome:** Produce a complete, attractive evaluation and send the matching PDF directly.

- **US25 (PM)** As a PM, I want Weekly, Monthly or Full Trainee Period reports for a selected trainee.
- **US26 (PM)** As a PM, I want to edit a report copy and make a complete PDF with charts and editable text fields.
- **US27 (PM)** As a PM, I want an internal composer with a professional cover message and the full matching report automatically attached as PDF.
- **US28 (Trainee)** As a trainee, I want my permitted personal reports and feedback.

Requirements:

- Document/page layout, not repeated trainee cards. Ten areas: attendance/punctuality; performance/learning; initial assessment; course results; skills/gaps; professionalism; PM feedback/next steps; sprint/blockers; gamification/published hackathon; profile/L&D.
- Use labelled charts and honest missing/final/source states. Remove Reports shortcuts Full evaluation profile, Course results, Assigned learning and Attendance. Retain all ten report areas, charts, Edit report, Make PDF and Email report. Professionalism uses human feedback.
- Save report-copy versions by trainee/type/range without changing official marks or attendance. Make PDF includes complete sections, pagination, charts and editable fields; external PDF edits do not automatically sync back.
- Internal recipient/subject/cover editor, attachment preview/download and explicit Send. No full-report text dump, mailto or external mailbox handoff. Preserve drafts/retry on failure; protect report files and correct snapshot selection.

### Epic 10: Gamification core: XP, levels, streaks and badges

**Outcome:** Reward eligible evidence transparently without replacing human performance judgement.

- **US29 (Trainee)** As a trainee, I want XP, level targets, current/longest streaks, weekly activity, badges and XP history.
- **US30 (PM)** As a PM, I want configurable rules and reasoned review, adjustment and reversal of reward events.

Requirements:

- Eligible verified learning, on-time sprint, final assessment, reviewed connected project/CI evidence, hackathon, kudos and reviewed adjustments can earn rewards.
- Pending, rejected and reversed awards do not count as current awarded XP. No automatic verified XP for raw commits/lines, manual Done, provisional grades or disconnected samples.
- PM manages values, caps, multiplier, cutoff, level thresholds, flagged events and audit reasons. One source event cannot award twice.
- Leave/holidays privately freeze streaks. Technical badges require passed assessment and PM-reviewed project; milestone/special rewards require eligible review. XP is not a standalone employment/performance rating.

### Epic 11: Quests, leaderboard, hackathons and kudos

**Outcome:** Support participation, recognition and fair visibility.

- **US31 (Trainee)** As a trainee, I want weekly quests, leaderboard views and hackathon participation.
- **US32 (Trainee)** As a trainee, I want to give peer kudos and optionally hide my public leaderboard identity.
- **US33 (PM)** As a PM, I want to schedule/review quests, score/publish hackathons and investigate suspicious recognition.

Requirements:

- Weekly quests include dates, targets, progress, review and once-only completion rewards. PM sees scoped engagement and source-labelled trends.
- Weekly/monthly/all-time leaderboards use awarded XP. Opt-out hides public identity while preserving the trainee's own rank context.
- Weekly hackathons support join/entry/submission, PM scoring/publication and once-only participation/winner rewards/badges. Published results enter monthly engagement and overall reports.
- Kudos use send/receive caps, repeat-recipient cooldown and reciprocal-pattern review. Engagement requests awards through the core ledger rather than directly changing totals.

### Epic 12: Profiles, settings and Policy

**Outcome:** Keep personal controls simple and preserve the requested Policy feature.

- **US34 (PM)** As a PM, I want to change my profile picture and account/notification preferences.
- **US35 (Trainee)** As a trainee, I want one Profile & Settings destination for personal details, security and preferences.
- **US36 (PM)** As a PM, I want the requested Policy feature, with its detailed behavior confirmed before implementation.

Requirements:

- PM settings stay focused on Account and Notifications; profile-picture changes persist. Gamification configuration belongs in Gamification.
- Trainee Profile & Settings combines identity, manager/team/date, skills/results/badges and permitted personal/security/notification settings; protected fields remain controlled.
- Remove trainee Integrations, UI states and Connected tools. Do not restore GitHub Evidence through settings.
- Policy is retained on the PM side. Its content and view-only versus author/edit/manage permissions are still open; do not invent acknowledgement/signature/approval flows.

---

## Delivery and scope control

### Ownership, boundaries and open decisions

All E01–E10 are full-stack developers: their own module UI, APIs, Prisma changes, validation, tests and
integrations. E11 is dedicated DevOps, starting on day one.

| Member | Primary module |
|---|---|
| E01 | Identity, shared shell, dashboard, notifications and shared event foundation. |
| E02 | Directory, teams, full trainee profile and L&D feedback. |
| E03 | Expertise, initial/retest and course assessment engine, AI, results and appeals. |
| E04 | 50-course catalog, curriculum/resources, recommendations display, assignments/requests. |
| E05 | Learning Roadmap, lessons/progress; integrates E03 exam/result components. |
| E06 | Daily Sprint, team sheets, DS meetings and code-quality context. |
| E07 | ERP/Teams attendance, leave decisions and approved-leave events. |
| E08 | Comprehensive reports, editable PDF and internal mailbox. |
| E09 | XP ledger/rules, levels, streaks/freezes, badges and reward audit. |
| E10 | Quests, leaderboards, hackathons, kudos and shared integration/components. |
| E11 | Infrastructure, CI/CD, Neon environments, secrets, deployment, monitoring and recovery. |

**Build sequence:** contracts/schema/security/CI → identity and profiles → parallel skills/catalog/sprints/attendance
→ learning/exams and reward core → engagement and complete reporting/mail → integrated QA, live-adapter
verification and release.

**Excluded:** GitHub Evidence screens for both roles; PM Connect repository; trainee self-signup; role tabs;
standalone Assessments sidebar; PM learner exams/video progress; PM personal attendance/Reconciliation/late
display; Your trainees and Workspace shortcuts dashboard sections; Trainee actions profile side panel;
four-link Reports shortcut block; repeated report cards; trainee Integrations/UI states/Connected tools;
automatic course assignment; new-model training; cash rewards, unapproved season resets or batch-vs-batch ranking.

**Open decisions retained in scope:** Policy content and permissions; the actual 50-course seed content;
provider permissions/credentials; published assessment and XP rules; supporting host/job/file choices;
retention, recovery and load targets. These are not silently removed features.

**Release acceptance:** complete both role journeys using durable scoped records; validate
assessment/assignment/leave/reward boundaries, all ten report areas, editable PDF and matching attachment,
safe failures and absence of removed UI. See SRS acceptance checks.

---

## Latest change record (5 November 2026): published UI v19 alignment

This edition supersedes the previous English PRD/SRS for the changes listed below. All other approved
requirements remain in scope.

| Area | Final behavior |
|---|---|
| PM Dashboard | Keep All Users, Skill reports, Course requests, Leave requests and Needs your attention. Remove Your trainees and Workspace shortcuts. |
| All Users / evaluation profile | Name click opens full personal/training information and all ten evaluation cards. Remove the separate Trainee actions / What's next? panel. Keep contextual evaluation-card controls. |
| PM Reports | Remove only the four shortcut links: Full evaluation profile, Course results, Assigned learning and Attendance. Keep the full report document, all ten evaluation areas, charts, report periods, editing, PDF and internal email. |
| Other scope | No other PM or trainee feature is removed by this revision. |

**Baseline source:** published UI version 19 · source commit `c19525d1006b315a3c6b8953f6ec1bbc14e6df95` ·
source archive `BS23_Training_Workspace_Final_Source_v19.zip`.

The approved implementation stack remains Next.js, TypeScript, NestJS, PostgreSQL on Neon and Prisma.
The current HTML/Worker prototype demonstrates UI behavior; production integrations and backend
requirements are specified, not claimed completed.
