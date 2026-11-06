# BS23 Training Workspace: Final SRS

**Software Requirements Specification · Version 3.2 · UI baseline v19 · 5 November 2026**
Beginner-friendly English · Functional and technical requirements
Calendar: Asia/Dhaka · Companion: [PRD](prd.md) (Epics E01–E12, stories US01–US36)

> Markdown copy of `BS23_Final_SRS_EN_v19.pdf`. The PDF is the source of truth. If this file and the
> PDF ever differ, follow the PDF and tell E11 so this copy can be fixed.

This SRS describes observable system behavior for the separate final English PRD. "Shall" means required
in the target implementation; it does not claim the existing prototype already does it.

**System boundary:** Next.js/TypeScript displays PM and trainee screens. NestJS/TypeScript owns
authorization and business rules. Prisma accesses PostgreSQL hosted on Neon. Backend workers perform long
AI, sync, PDF and mail work. Browser storage is only a non-authoritative draft/cache.

| Term | Meaning |
|---|---|
| Declared skill | A person's statement, not proof of competence. |
| Verified mastery | Supported by final eligible assessment evidence. |
| Content progress | Learning activity; separate from assessed mastery. |
| Provisional result | Required scoring or review is not complete. |
| Snapshot | An identified report copy with trainee, range and source versions. |
| Idempotent | Retrying the same action does not create the same effect twice. |
| Unavailable | Evidence is missing/disconnected; not automatically zero or absence. |

**Baseline:** published v19. Retain full name-click evaluations, initial 50-course catalog, catalog-only
suggestions, retesting, PM photo/Policy, roadmap states and merged trainee settings. Apply latest PM
dashboard, profile-panel and Reports-shortcut removals.

APIs and data models below are implementation contracts, not deployed endpoint claims. Supporting hosting,
worker, file-storage and provider products remain choices. No third application role is introduced.

Reference: `bs23-training-workspace-brishty.stillpenny2.chatgpt.site`

---

## Functional: Epics 01–02 · Identity, shared shell and trainee profiles

### AUTH / SHELL

- **AUTH-01** Provide one login; resolve role on the server. Only PM signup (name, email, password/confirmation). No trainee signup or role tabs. Validate duplicate identity.
- **AUTH-02** Use secure server password hashing/sessions, sign-out and permitted password/recovery flows. Check role, workspace and record access on every API/export/file download. Never return answer keys or credential fields.
- **AUTH-03** Require current initial expertise/evaluation completion on first login, then allow dashboard entry without an extra PM approval lock.
- **UI-01** Preserve approved dark/violet navigation, compact branding, real bell and role-appropriate dashboards. PM counts link to authorized queues; trainee figures belong to the authenticated trainee.
- **NOTI-01** Persist recipient-scoped context notifications, unread/read and mark-all-read. Deduplicate delivery and target meetings by team. Do not expose private answers/leave reasons or send external email automatically.

### DIRECTORY / PROFILE

- **DIR-01** Create/edit unique ID/email, name, temporary credential, position (Full Stack/Frontend/Backend/QA/DevOps), Online/Physical mode, required team and onboarding date; no related-skills input.
- **DIR-02** Search/filter directory and paginate five rows; reset/clamp page on filters. Retain identity, team, mode, position/skills, date range, progress, 14-day summary, selected attendance and L&D context.
- **DIR-03** Name opens a full evaluation profile: personal/training information and ten evaluation cards (initial, course results, skills, learning, sprint, attendance, professionalism, PM feedback, gamification and profile/L&D). Keep contextual card controls. No Actions column, actions-only dialog or Trainee actions side panel.
- **DIR-04** Onboarding day is Day 1; include weekends/leave. Missing date: Unavailable; future: Not onboarded yet. Show date to both roles. Summary covers selected day plus prior 13, clipped to onboarding, max three evidence-based bullets.
- **DIR-05** Preserve L&D feedback versions, author/time. Keep human feedback independent of AI grades/report-copy edits. Maintain the selected trainee/team across contextual evaluation controls.

---

## Functional: Epics 03–04 · Assessment, retest and AI recommendations

### INITIAL / RETEST

- **INIT-01** Require joining role, at least one technology, experience, confidence, improvement and nonempty goals; validate Other text. Store declared role separately from PM position.
- **INIT-02** Roles: Frontend/Backend/Full Stack/Software Engineer/QA/DevOps/Other. Technologies: JavaScript, React.js, Next.js, Node.js, Laravel, PHP, Python, Java, MySQL, PostgreSQL, Docker, Git/GitHub, Other.
- **INIT-03** Experience: Beginner/Intermediate/Advanced. Confidence: Not/Somewhat/Confident/Very Confident. Improvement choices: fundamentals, problem solving, backend/frontend, database, architecture, API, testing/code quality and Other.
- **INIT-04** Freeze question/rubric/profile versions. Baseline two objective questions per supported tech plus required practical explanation; Beginner foundation+applied, Intermediate foundation+advanced, Advanced applied+advanced. Cover QA; label unsupported/fallback skills honestly.
- **INIT-05** Backend objective scoring; confidence contributes no marks. Initial level: Advanced ≥80%, Intermediate 60–79%, Beginner <60%, with threshold version. Store raw responses, score/total and evidence; finalize once.
- **INIT-06** Share the saved report with trainee and authorized PM; include known/gap/unassessed skills, level, goals, practical status and recommendations. Retest creates new versions/history and notification; stale jobs cannot overwrite newer results or assignments.

### AI

- **AI-01** Use an existing model API from NestJS; keep credentials private. Apply explicit rubrics to written/practical/code review; backend validates totals. Code runs in a disposable isolated runner with resource/network limits.
- **AI-02** Validate response schema, score bounds, evidence/answer IDs and available catalog course IDs. Treat submitted/retrieved text as untrusted instructions. Store provider/prompt/rubric/job versions, statuses and bounded retry history.
- **AI-03** Recommendations use role requirements and demonstrated gaps; assessed per-skill baseline Strong ≥80%, Developing 60–79%, Needs revision <60%. Untested = Not assessed; profile-only suggestions = Unassessed.
- **AI-04** Use only the initial 50 curated courses plus available PM catalog additions; never invent/publish/autoassign courses. Skills analysis opens trainee-filtered suitable courses with reasons/priorities/preview, while report access remains.
- **AI-05** On timeout/invalid output show pending/failed/review-required; preserve previous valid results. Do not infer professionalism, employment suitability or leave legitimacy.

---

## Functional: Epics 05–06 · Catalog, learner content and course exams

### CATALOG / LEARNING

- **COURSE-01** Seed exactly 50 curated initial courses; allow additions. PM tabs: Suggested, All courses, Assignments, Requests. Place Add course beside All courses. Save title/track/description/ordered topics/HTTPS resources, duplicate validation and versions.
- **COURSE-02** Assign course/version to person/team transactionally with audit and preserved history. Save displayed due dates. Pending request grants no access; approval creates entitlement plus notification once. Reject duplicate active requests.
- **COURSE-03** PM content preview/result review is read-only learner evidence. Deny PM learner-attempt endpoints, personal watch/progress tracking and invented exams for courses without published question sets.
- **LEARN-01** Show only entitled learning with Assigned/Completed, search/filter, Continue/Open. Share graph by curriculum version; persist state per trainee/assignment/topic. Learning/Mark as done/Skip via hover, keyboard and touch; manual/skip grants no verified mastery/XP.
- **LEARN-02** Retain overview/outcomes/prerequisites/subtopics, reviewed lessons/examples/pseudocode/resources/previous-next. Graph: HTML, CSS, JavaScript, npm, Git/GitHub, React, Tailwind, Node, PostgreSQL, REST, JWT, Redis, Linux, AWS branch, Monit, GitHub Actions, Ansible, Terraform and checkpoints.
- **LEARN-03** Distinguish MDN/YouTube resource/search links from live API-ranked metadata. Do not fabricate provider data.

### COURSE ASSESSMENT

- **EXAM-01** Authorize trainee/content entitlement; freeze instructions/questions/rubric/duration/attempt policy and acknowledgement. Autosave versioned answers with saved/error state and recover accepted answers after refresh.
- **EXAM-02** Use server deadline; explicit or timeout submission finalizes once. Refresh/retry must not extend time or duplicate results. Browser integrity controls are best effort, not proof of cheating or guaranteed screenshot prevention.
- **EXAM-03** Deterministic objective score; shared AI/test/review pipeline for written/code. Provisional results are excluded from final averages/mastery/eligible XP. Course baseline Done ≥80%, Needs revision 60–79%, Weak <60%, under published versioned policy.
- **EXAM-04** Retain result/attempt history, revision advice, appeal reason and review provenance. PM result view and overall report read the same records. Do not make prototype timing/question-count examples universal policy.

---

## Functional: Epics 07–08 · Sprint work, quality, attendance and leave

### SPRINT / MEETINGS / QUALITY

- **SPRINT-01** Persist trainee/day task title/description/category, planned/actual hours, start/end, blocker, completion timestamps and optional HTTPS GitHub owner/repo URL. Validate 0–24 hours in quarter-hour input and end after start; preserve independent tasks/history.
- **SPRINT-02** Team-first sheet only; unique team/week and team/trainee/date/field cells. Next Add Sprint adds exactly seven days once; retain old weeks, blue header/date/row/formula context, scroll and selected trainee context.
- **SPRINT-03** Version cell edits with actor/time; show save/unsaved/error and reject stale overwrite with conflict handling. Record daily submission once per trainee/local day and emit eligible streak/on-time review event.
- **MEET-01** PM Add new DS meeting: title, team/all, date, Asia/Dhaka time, optional Teams URL; notify matching trainees once and expose join link. URL alone does not create a Teams calendar event. Team weekly reports are PM-only.
- **QUALITY-01** Retain task repository references and scoped SonarQube Cloud review for reliability/security/maintainability/coverage/duplication/code smells; report disconnected/pending honestly. Repos open approved external links, not removed GitHub Evidence routes. XLSX/history previews are not completed XLSX export services.

### ATTENDANCE / LEAVE

- **ATT-01** PM register filters authorized trainees/date with ERP, Teams and Leave tabs; omit personal stat boxes, PM Reconciliation and Late/late-minute UI.
- **ATT-02** ERP retains source ID, identity mapping, date/check-in/out/hours/status/sync freshness. Teams retains meeting/scheduled start/join intervals/duration and source availability; overlapping rejoins do not double-count. Preserve source punctuality separately from removed PM display.
- **ATT-03** Missing checkout/hours = Unknown; missing/unmapped evidence = Unavailable/Pending, not inferred Absent. Keep office and meeting evidence, online-mode rules, nonworking days and approved leave distinct. Trainee personal ERP/reconciliation remains.
- **LEAVE-01** Submit type/start/end/reason; reject reversed dates. Pending → Approved/Declined with PM note/actor/time, notification and duplicate-safe decision. Approved leave privately freezes streak days through reward core; do not rewrite official attendance.

---

## Functional: Epic 09 · Reports, editable PDF and direct email

### REPORT

- **REPORT-01** Select trainee and Weekly (seven inclusive days, default Monday–Sunday), Monthly (actual calendar month), or Full Trainee Period (onboarding to valid end). Use Asia/Dhaka date boundaries.
- **REPORT-02** Include all ten areas: attendance/punctuality; performance/learning; initial assessment; course results; skills/gaps; professionalism; PM feedback/next steps; sprint/blockers; engagement/published hackathon; profile/L&D.
- **REPORT-03** Use document layout and labelled charts with source provenance. Separate range events from cumulative/current snapshots; undated evidence is not a weekly/monthly event. Missing/final-unavailable data is Not available, not zero. Human authorship supplies professionalism.
- **REPORT-04** Do not render the Full evaluation profile, Course results, Assigned learning or Attendance shortcut block in Reports. Keep all ten document areas and Edit report / Make PDF / Email report. Save report-copy edits by workspace/trainee/type/start/end and version/actor/time. Keep original grades/attendance immutable.
- **PDF-01** Make PDF exports complete paginated sections/charts with editable AcroForm text fields readable in compatible readers. Preserve snapshot identity/source versions. External file edits do not automatically update backend records or saved drafts.
- **REPORT-05** Enforce PM and personal trainee report permissions; PM-only weekly team reports stay private. Protect snapshots/attachment downloads with record access, not public links.

### MAIL

- **MAIL-01** In-app composer contains recipient, editable professional subject/concise cover and automatically attached complete matching PDF snapshot. Show filename/size and preview/download. No full-report body dump, mailto or external composer handoff.
- **MAIL-02** Changing trainee/type/range regenerates the correct attachment and default references, preserving safe custom draft input. Require explicit Send and validate recipient, text, PDF type/size/name, snapshot association and authorization server-side.
- **MAIL-03** Persist idempotent send state: Draft → Queued → Sending → Accepted/Failed. Unconfigured sender disables send; failure retains draft and retry. Provider acceptance with ID is not proof of inbox delivery/read.
- **MAIL-04** Migrate prototype mail status/send behavior to authenticated NestJS. Existing Worker status/send and Resend adapter are reference only; no configured sender is assumed. Retain the existing seven-megabyte payload validation baseline pending documented transport limits.

---

## Functional: Epics 10–12 · Engagement, profiles, settings and Policy

### GAMIFICATION

- **GROW-01** XP Pending/Awarded/Rejected/Reversed; totals use active eligible awards. Unique event/rule key and atomic caps prevent duplicates. Eligible sources match PRD; raw commits/lines/manual done/provisional marks/disconnected fixtures cannot autoaward verified XP.
- **GROW-02** Version PM rule values/caps/multiplier/cutoff/level thresholds; audit flagged review, reasoned adjustment/reversal and evidence. Daily/longest streak/weekly strip use local eligible days; leave/holidays freeze privately. Technical badge requires passed assessment plus PM project review.
- **GROW-03** Weekly quest schedule/edit/target/progress/review and once-only completion. Weekly/monthly/all-time leaderboard reads awarded ledger; opt-out hides public identity while retaining own view.
- **GROW-04** Hackathon schedule/join/submit/score/publish; participation/winner XP/badge once, published results enter monthly/overall report. Kudos send/receive caps and recipient cooldown enforced server-side; flag suspicious reciprocal patterns.
- **GROW-05** Engagement requests stable awards from core; it cannot write XP/badge totals directly. PM sees scoped trends. XP is not an employment rating; no cash rewards, unapproved seasons or batch ranking.

### ACCOUNT / POLICY / UI

- **ACCOUNT-01** PM Account/Notifications settings and authorized picture change persist. Validate image type/size and safe file access. Security/password/recovery controls must show truthful states.
- **ACCOUNT-02** One trainee Profile & Settings destination: identity, position, skills, mode, manager/team/date, reports/badges and permitted security/notification/preferences. Protect PM-controlled fields; remove Integrations, UI states and Connected tools.
- **POLICY-01** Retain a PM Policy feature; content and view-only versus create/edit/manage authorization are pending. No invented signature/acknowledgement/approval workflow.
- **UI-02** Do not restore removed GitHub Evidence, role tabs, trainee signup, standalone Assessments sidebar, PM learner exam/watch metrics, PM personal attendance/reconciliation/late UI or repeated report cards. Initial skill analysis, trainee exams and Git curriculum/repo references remain.
- **UI-03** PM dashboard shall omit Your trainees and Workspace shortcuts. Retain four work cards (All Users, Skill reports, Course requests, Leave requests) and Needs your attention. Previously removed average/learning charts stay absent; trainee dashboard is unchanged.

---

## Data and contracts · Records, interfaces and state ownership

Use one canonical Prisma schema/migration history under the NestJS application. Every domain record carries
workspace scope and relevant trainee, actor, timestamps and version/provenance.

| Owner | Logical records / proposed API group |
|---|---|
| E01 | User/Credential/Session, Notification/Preference, OutboxEvent; auth/me/dashboard/notifications/account/photo. |
| E02 | TraineeProfile, Team/Membership, L&DFeedbackVersion; trainees/teams/feedback/full profile. |
| E03 | ExpertiseVersion, Skill/RoleRequirement, Question/Rubric versions, Initial/CourseAttempt/Response, EvaluationJob/Result, Appeal, Recommendation; expertise/attempts/evaluations/results/recommendations. |
| E04/E05 | Course/Version/Topic/Resource, Assignment/Request; LearnerTopicState/LessonProgress/CompletionEvent; courses/assignments/requests/learning. |
| E06 | Task/Submission/Week, SheetCellVersion, DSMeeting, QualityScan/ProjectReview; sprints/sheets/meetings/code-quality. |
| E07 | IdentityMapping, Attendance/MeetingIntervals/SyncRun, LeaveRequest/Decision; attendance/meeting-attendance/leave. |
| E08 | ReportDraftVersion/Snapshot/File, MailDelivery/Attempt; report-drafts/snapshots/mail. |
| E09/E10 | XPRule/Event/Review, Level/Streak/Freeze/Badge/Audit; Quest/Progress, LeaderboardPreference/Projection, Hackathon/Entry, Kudos/Review; growth-core/engagement. |

- Course approval plus entitlement is atomic. Unique constraints cover identity, active requests/entitlements as approved, attempt finalization, team/week, trainee/day submission, imported source ID, reward keys and mail idempotency.
- Sheet/report updates use expected versions; return a conflict instead of silent overwrite. Preserve question/results/feedback/report history after routine profile/content edits. Do not cascade-delete historical evidence.
- Use calendar-day types for work periods and unambiguous instants for events; derive Dhaka dates explicitly. Use integer minutes or bounded numeric time, not accumulating imprecise floats.
- Typed DTO/OpenAPI contracts define pagination, filters, validation, errors and conflict semantics; exact routes are finalized at contract freeze. Policy data/API depends on the pending content decision.
- Commit domain state and outbox event together. Events carry unique ID/type/version/workspace/aggregate/actor/time and safe payload references; consumers deduplicate. Never put plaintext credentials/private leave reasons in public events.

---

## Architecture and quality · Security, reliability and deployment

- **Application:** apps/web (Next.js), apps/api (NestJS with Prisma), shared public contracts and UI components. NestJS owns permissions/scores/deadlines/approvals/XP/snapshots; Next Server Actions/route handlers may only proxy, not duplicate authority.
- **Access:** secure production session handling, CSRF/origin protection for writes, explicit credentialed CORS if cross-origin. Private user/report responses cannot leak through public/shared caches. Deny cross-user/workspace access, including files/jobs.
- **Secrets/data:** database/AI/mail/source secrets remain server-side, never NEXT_PUBLIC values. Validate/encode inputs in UI/PDF/email; restrict URL schemes. Scrub private responses/credentials/leave reasons from routine logs.
- **Workers/adapters:** AI/sync/PDF/mail run as durable jobs; track status, timeout, retry and stale-result checks. Use adapters for AI, ERP, Teams, Sonar, mail and files. Do not hold a DB transaction across external calls/code execution. In-memory events alone are insufficient.
- **UX:** semantic names, keyboard/focus/dialog handling, contrast, responsive tables and mobile controls. Show loading/empty/pending/failed/disconnected/conflict states; recover accepted drafts. Candidate ordinary-read target: under two seconds at agreed pilot load, to be measured.
- **Neon/Prisma:** pin compatible framework/runtime/ORM/driver versions and lockfiles. Use reviewed pooled runtime connections and protected direct migration/admin connection where required by the selected integration. Match migration commands/config to the pinned Prisma major.
- **Environments:** isolate dev/test/staging/production and credentials; no production resets/seeds. Test actual PostgreSQL constraints, not an SQLite substitute. Index scope/date/status/filter keys; paginate large histories.
- **Operations:** audit grades, L&D, leave, XP and report edits. Monitor workers/sync freshness/mail status, provide runbooks, and prove backup/restore and rollback in staging. Retention/recovery/load objectives are pending decisions.

**CI release gate:** Locked install → lint/types → Prisma validate/generate → clean and upgrade migrations →
backend/domain/access/contract/idempotency tests → Next production build → PM/trainee E2E → staging
migrations/smoke → controlled release and recovery checks. Mandatory failure blocks release.

**Ownership boundary:** E03 owns initial/retest/course grading and reusable exam components; E05 integrates
learning, E04 catalog/access. E09 alone writes core awards; E10 requests them. E08 edits report copies, never
source grades. E11 deploys/operates the infrastructure and isolated runner.

---

## Acceptance and traceability · End-to-end checks

These checks are release conditions, not claims of completed production verification. Epic numbers map to the
PRD; linked stories US01–US36 define the user intent.

| Test | Expected result | Epic |
|---|---|---|
| T01 | Common login resolves role; no trainee signup; unauthorized APIs/files denied. | 01 |
| T02 | Required team/date, duplicate identity, full name-click profile with all ten evaluation cards and no Trainee actions panel; correct Day 1/future/missing/14-day summary. | 02 |
| T03 | Required survey → versioned questions → once-only result → same scoped PM/trainee report. | 03 |
| T04 | Retest preserves history and updates suggestions/notification without changing assignments. | 03–04 |
| T05 | 50-course initial seed; only valid available catalog IDs; invalid AI output/timeout remains pending/failed. | 04 |
| T06 | Skills analysis opens selected trainee suggestions; Add course works; PM cannot take learner exam. | 04–05 |
| T07 | Request approval creates one entitlement/notification; team assignment preserves history; due date persists. | 05 |
| T08 | Graph/shared version with personal state; accessible hover actions; manual done/skip earns no mastery/verified XP. | 06 |
| T09 | Exam autosave/deadline survives refresh; once-only submit; provisional marks excluded from final/XP; appeal/history retained. | 06 |
| T10 | Next sprint is exactly seven days; prior data retained; stale cells conflict; daily submission deduplicates. | 07 |
| T11 | Correct meeting audience/context; PM-only report denied to trainee; repo/quality unavailable status honest. | 07 |
| T12 | PM attendance has all-trainee filters and no personal/reconciliation/late UI; unknown data never inferred absent. | 08 |
| T13 | Leave decision once; correct private streak freeze, source evidence unchanged. | 08/10 |
| T14 | Weekly/month/full periods and all ten report areas; final/unavailable and snapshot/range distinctions correct. | 09 |
| T15 | Draft isolation; complete editable-field PDF renders/parses; source grades unchanged. | 09 |
| T16 | Matching private PDF attachment; selection change safe; unconfigured sender disabled; retry/double-click no duplicate accepted send. | 09 |
| T17 | Reward dedup/caps/reversal audit; no unverified awards; privacy/technical badge criteria. | 10 |
| T18 | Kudos cooldown/caps, leaderboard opt-out, quest/hackathon once-only publication rewards and report handoff. | 11 |
| T19 | PM photo persists; merged trainee settings; no Your trainees/Workspace shortcuts on PM dashboard or four-link Reports block; bell/context links and accessible theme. | 01/12 |
| T20 | Restart/replay safe; migration/restore/rollback proven; no frontend secret/private-cache leak; pinned stack builds. | All |

**Integration handoffs:** E03 results/recommendations use E04 catalog IDs; E05 mounts E03 exams; E07 leave and
E06 work feed E09; E10 asks E09 for rewards; E08 consumes E02–E07/E09/E10; every producer uses E01 scoped
notifications. E11 supports all modules from day one.

**Open production gates:** Policy behavior/ownership, curated 50-course content, source/sender/AI permissions,
rubrics/attempt and XP rules, hosting/job/files, account activation/recovery policy, retention and measured
load/recovery targets. Do not claim a connected launch while mandatory dependencies remain unverified.

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

The approved implementation stack remains Next.js, TypeScript, NestJS, PostgreSQL on Neon and Prisma. The
current HTML/Worker prototype demonstrates UI behavior; production integrations and backend requirements are
specified, not claimed completed.
