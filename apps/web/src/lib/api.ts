"use client";

// Mock API. Every function here maps to a future NestJS endpoint. Pages never write to
// the store directly. Validation mirrors SRS §2 and the edge-case copy in SRS §5.

import { getDB, mutate } from "./store";
import type {
  Assignment,
  AttendanceRecord,
  Course,
  DB,
  DSCell,
  DSColumn,
  ExpertiseEvaluation,
  IntegrityEvent,
  LeaveRequest,
  Position,
  AttendanceMode,
  Resource,
  Report,
  IntakeAnswers,
  ProctoringRecord,
  ReportPeriodType,
  SprintTask,
  TaskVerification,
  TechResult,
  TopicStateValue,
  User,
  XpEvent,
  XpRules,
  Level,
  Kudos,
  IntegrationKey,
  Trainee,
} from "./types";
import { ALWAYS_SHOWN_CATEGORIES, INTAKE_ABILITY, INTAKE_DESCRIPTION_MAX, INTAKE_NO_PROJECTS, QUESTION_BANK, REPORT_SECTIONS, type BankQuestion } from "./content";
import { addDays, isEmail, isHttpsUrl, isWeekend, nowHHMM, todayISO, uid, weekStartOf } from "./utils";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (error: string): Result<never> => ({ ok: false, error });
const nowIso = () => new Date().toISOString();

/* ================================ selectors ================================ */

export function currentUser(db: DB): User | null {
  return db.users.find((u) => u.id === db.currentUserId) ?? null;
}

export function traineeOf(db: DB, userId: string) {
  return db.trainees.find((t) => t.userId === userId);
}

export function userById(db: DB, id?: string) {
  return db.users.find((u) => u.id === id);
}

export function nameOf(db: DB, id?: string) {
  return userById(db, id)?.name ?? "Unknown";
}

/** PM scope: only active (not archived) trainees managed by this PM (FR-DIR-07). */
export function pmTrainees(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId && !t.archivedAt);
}

/** Active and archived trainees managed by this PM, for views that also show finished trainees. */
export function pmPeople(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId);
}

/** Archived (inactive) trainees managed by this PM. */
export function pmArchivedTrainees(db: DB, pmId: string) {
  return db.trainees.filter((t) => t.pmId === pmId && !!t.archivedAt);
}

export function inScope(db: DB, pmId: string, traineeUserId: string) {
  return pmPeople(db, pmId).some((t) => t.userId === traineeUserId);
}

export function evaluationsOf(db: DB, traineeUserId: string) {
  return db.evaluations.filter((e) => e.traineeUserId === traineeUserId).sort((a, b) => b.version - a.version);
}

export function latestEvaluation(db: DB, traineeUserId: string) {
  return evaluationsOf(db, traineeUserId)[0];
}

/**
 * Skills shown for a user: the skills they chose in their latest skill assessment (intake Q4).
 * A user with no assessment yet has no skills, so `taken` is false and the list is empty.
 * Users from the demo seed that have no assessment on record keep their stored skills.
 */
export function skillsOf(db: DB, traineeUserId: string): { skills: string[]; taken: boolean } {
  const ev = latestEvaluation(db, traineeUserId);
  if (ev) return { skills: ev.technologies, taken: true };
  const stored = db.trainees.find((t) => t.userId === traineeUserId)?.skills ?? [];
  return { skills: stored, taken: stored.length > 0 };
}

export function courseById(db: DB, id: string) {
  return db.courses.find((c) => c.id === id);
}

export function publishedVersion(course: Course) {
  return course.versions.find((v) => v.status === "PUBLISHED") ?? course.versions[0];
}

export function assignmentsOf(db: DB, traineeUserId: string) {
  return db.assignments.filter((a) => a.traineeUserId === traineeUserId);
}

export function versionForAssignment(db: DB, a: Assignment) {
  const c = courseById(db, a.courseId);
  return c?.versions.find((v) => v.id === a.courseVersionId) ?? (c ? publishedVersion(c) : undefined);
}

/** Content completion and verified mastery are separate numbers (FR-LRN-03). */
export function courseProgress(db: DB, traineeUserId: string, a: Assignment) {
  const v = versionForAssignment(db, a);
  if (!v) return { contentPct: 0, masteryPct: 0, done: 0, total: 0, mastered: 0, topics: 0 };
  const subs = v.topics.flatMap((t) => t.subtopics.map((s) => s.id));
  const done = subs.filter((s) => db.subtopicProgress.some((p) => p.traineeUserId === traineeUserId && p.subtopicId === s)).length;
  const mastered = v.topics.filter((t) => topicState(db, traineeUserId, t.id) === "MASTERED").length;
  return {
    contentPct: subs.length ? Math.round((done / subs.length) * 100) : 0,
    masteryPct: v.topics.length ? Math.round((mastered / v.topics.length) * 100) : 0,
    done,
    total: subs.length,
    mastered,
    topics: v.topics.length,
  };
}

export function overallProgress(db: DB, traineeUserId: string) {
  const as = assignmentsOf(db, traineeUserId);
  if (!as.length) return { contentPct: 0, masteryPct: 0 };
  const ps = as.map((a) => courseProgress(db, traineeUserId, a));
  return {
    contentPct: Math.round(ps.reduce((s, p) => s + p.contentPct, 0) / ps.length),
    masteryPct: Math.round(ps.reduce((s, p) => s + p.masteryPct, 0) / ps.length),
  };
}

export function topicState(db: DB, traineeUserId: string, topicId: string): TopicStateValue {
  return db.topicStates.find((s) => s.traineeUserId === traineeUserId && s.topicId === topicId)?.state ?? "NOT_STARTED";
}

export function isSubtopicDone(db: DB, traineeUserId: string, subtopicId: string) {
  return db.subtopicProgress.some((p) => p.traineeUserId === traineeUserId && p.subtopicId === subtopicId);
}

export function attemptPercent(a: { objectiveScore: number; objectiveTotal: number; finalScore?: number }) {
  if (a.finalScore != null) return a.finalScore;
  return a.objectiveTotal ? Math.round((a.objectiveScore / a.objectiveTotal) * 100) : 0;
}

export function assessmentAverage(db: DB, traineeUserId: string) {
  const at = db.attempts.filter((a) => a.traineeUserId === traineeUserId && a.status !== "PENDING_OFFLINE");
  if (!at.length) return null;
  return Math.round(at.reduce((s, a) => s + attemptPercent(a), 0) / at.length);
}

/** Suggested courses from skill gaps (FR-CRS-01/02). Suggestions never assign. */
export function suggestedCourses(db: DB, traineeUserId: string) {
  const ev = latestEvaluation(db, traineeUserId);
  if (!ev) return [];
  const gaps = ev.results.filter((r) => r.status !== "Strong").map((r) => r.technology);
  const assigned = new Set(assignmentsOf(db, traineeUserId).map((a) => a.courseId));
  return db.courses
    .filter((c) => c.covers.some((t) => gaps.includes(t)) && !assigned.has(c.id))
    .map((c) => {
      const tech = ev.results.find((r) => c.covers.includes(r.technology) && r.status !== "Strong");
      return {
        course: c,
        reason: tech ? `${tech.technology}: ${tech.status} (${tech.priority} priority)` : "",
        priority: tech?.priority ?? "Medium",
        approved: db.suggestionApprovals.some((s) => s.traineeUserId === traineeUserId && s.courseId === c.id),
      };
    })
    .sort((a, b) => ["High", "Medium", "Low"].indexOf(a.priority) - ["High", "Medium", "Low"].indexOf(b.priority));
}

export function xpTotal(db: DB, traineeUserId: string, since?: string) {
  return db.xpEvents
    .filter((e) => e.traineeUserId === traineeUserId && e.status === "AWARDED" && (!since || e.date >= since))
    .reduce((s, e) => s + e.amount, 0);
}

export function levelFor(db: DB, xp: number) {
  const sorted = [...db.levels].sort((a, b) => a.minXp - b.minXp);
  let idx = 0;
  sorted.forEach((l, i) => {
    if (xp >= l.minXp) idx = i;
  });
  const next = sorted[idx + 1];
  return { level: sorted[idx], next, progress: next ? Math.round(((xp - sorted[idx].minXp) / (next.minXp - sorted[idx].minXp)) * 100) : 100 };
}

/** Consecutive working days with a sprint submission; leave/holiday freezes keep the streak (FR-GAM-05). */
export function streakOf(db: DB, traineeUserId: string) {
  const subs = new Set(db.sprintSubmissions.filter((s) => s.traineeUserId === traineeUserId).map((s) => s.date));
  const frozen = new Set(db.streakFreezes.filter((s) => s.traineeUserId === traineeUserId).map((s) => s.date));
  let d = todayISO();
  if (!subs.has(d)) d = addDays(d, -1);
  let n = 0;
  for (let i = 0; i < 120; i++) {
    if (isWeekend(d) || frozen.has(d)) {
      d = addDays(d, -1);
      continue;
    }
    if (!subs.has(d)) break;
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** True when the recipient has unticked this notification's category in Settings → Notifications (it is then kept out of the bell). */
export function hiddenFromBell(db: DB, n: { recipientId: string; type: string }) {
  if (ALWAYS_SHOWN_CATEGORIES.includes(n.type)) return false;
  return db.notificationPrefs.find((p) => p.userId === n.recipientId && p.category === n.type)?.showInBell === false;
}

export function unreadCount(db: DB, userId: string) {
  return db.notifications.filter((n) => n.recipientId === userId && !n.readAt && !hiddenFromBell(db, n)).length;
}

export function integration(db: DB, key: IntegrationKey) {
  return db.integrations.find((i) => i.key === key)!;
}

export function weekIdFor(teamId: string, weekStart: string) {
  return `sw-${teamId}-${weekStart}`;
}

export function dsCell(db: DB, weekId: string, traineeUserId: string, date: string, column: DSColumn) {
  return db.dsCells.find((c) => c.id === `${weekId}|${traineeUserId}|${date}|${column}`);
}

/* ================================ helpers ================================ */

function notify(d: DB, recipientId: string, type: string, title: string, message: string, link?: string, requestId?: string) {
  d.notifications.unshift({ id: uid("n"), recipientId, type, title, message, link, ...(requestId ? { requestId } : {}), createdAt: nowIso() });
}


function addXp(d: DB, e: Omit<XpEvent, "id">) {
  if (d.xpEvents.some((x) => x.key === e.key)) return; // idempotent by unique key (FR-GAM-04)
  d.xpEvents.push({ id: uid("xp"), ...e });
}

/* ================================ auth (M1) ================================ */

export function login(identity: string, password: string, remember: boolean): Result<{ redirect: string }> {
  archiveExpiredTrainees(); // a departure date that has passed makes the account inactive before sign-in
  const db = getDB();
  const id = identity.trim().toLowerCase();
  const t = db.trainees.find((x) => x.traineeId.toLowerCase() === id);
  const u = db.users.find((x) => x.email.toLowerCase() === id || x.id === t?.userId || x.pmCode?.toLowerCase() === id);
  if (!u || u.password !== password) return fail("The login details are incorrect.");
  if (u.role === "PM" && !u.emailVerified) return fail("Verify your email before signing in. Open the link we sent to your work email.");
  if (db.trainees.some((x) => x.userId === u.id && x.archivedAt)) return fail("This account is inactive. Ask your PM to activate it.");
  const sessionId = uid("s");
  mutate((d) => {
    d.currentUserId = u.id;
    d.currentSessionId = sessionId;
    d.sessions.push({
      id: sessionId,
      userId: u.id,
      createdAt: nowIso(),
      lastSeenAt: nowIso(),
      device: `${typeof navigator !== "undefined" ? navigator.userAgent.split(")")[0].split("(")[1] ?? "Browser" : "Browser"}${remember ? " · remembered" : ""}`,
    });
  });
  return ok({ redirect: homeFor(u.id) });
}

export function homeFor(userId: string) {
  const db = getDB();
  const u = userById(db, userId);
  if (!u) return "/login";
  if (u.role === "PM") return "/pm/dashboard";
  if (u.mustChangePassword) return "/change-password";
  if (!latestEvaluation(db, u.id)) return "/trainee/onboarding";
  return "/trainee/dashboard";
}

export function logout() {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== d.currentSessionId);
    d.currentUserId = null;
    d.currentSessionId = null;
  });
}

export function registerPM(input: { name: string; email: string; password: string; confirm: string }): Result<{ token: string }> {
  const db = getDB();
  if (!input.name.trim()) return fail("Enter your full name.");
  if (!isEmail(input.email)) return fail("Enter a valid work email.");
  if (input.password.length < 8) return fail("Password must be at least 8 characters.");
  if (input.password !== input.confirm) return fail("Passwords do not match.");
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const id = uid("pm");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "PM", password: input.password, mustChangePassword: false, emailVerified: false, createdAt: nowIso() });
    d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: id, showInBell: true })));
  });
  return ok({ token: verificationToken(input.email.trim()) });
}

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Mock signed link token. The real backend issues a random, single-use token and emails it. */
export function verificationToken(email: string) {
  return btoa(`verify|${email}|${Date.now()}`);
}

/** Verifies a PM's email from the link token; a bad or expired token gives a clear message (FR-AUTH-04). */
export function verifyEmail(token: string): Result<{ email: string }> {
  let email = "";
  let issued = 0;
  try {
    const [kind, e, t] = atob(token).split("|");
    if (kind !== "verify") throw new Error("bad token");
    [email, issued] = [e, Number(t)];
  } catch {
    return fail("This verification link is invalid. Open the link from your email again.");
  }
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.toLowerCase());
  if (!u || !issued) return fail("This verification link is invalid. Open the link from your email again.");
  if (u.emailVerified) return ok({ email: u.email });
  if (Date.now() - issued > VERIFY_TTL_MS) return fail("This verification link has expired. Send yourself a new one below.");
  mutate((d) => {
    d.users.find((x) => x.id === u.id)!.emailVerified = true;
  });
  return ok({ email: u.email });
}

/** Always returns ok so the UI never reveals whether an email exists. */
export function requestPasswordReset(email: string): Result<{ token?: string }> {
  const u = getDB().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
  return ok({ token: u ? btoa(`${u.email}|${Date.now()}`) : undefined });
}

export function resetPassword(token: string, password: string, confirm: string): Result {
  let email = "";
  let issued = 0;
  try {
    [email, issued] = (() => {
      const [e, t] = atob(token).split("|");
      return [e, Number(t)] as [string, number];
    })();
  } catch {
    return fail("This reset link is invalid.");
  }
  if (!email || Date.now() - issued > 30 * 60 * 1000) return fail("This reset link has expired. Request a new one.");
  if (password.length < 8) return fail("Password must be at least 8 characters.");
  if (password !== confirm) return fail("Passwords do not match.");
  mutate((d) => {
    const u = d.users.find((x) => x.email === email);
    if (u) u.password = password;
  });
  return ok();
}

export function changePassword(userId: string, current: string, next: string, confirm: string): Result {
  const u = userById(getDB(), userId);
  if (!u) return fail("Not signed in.");
  if (u.password !== current) return fail("Current password is incorrect.");
  if (next.length < 8) return fail("Password must be at least 8 characters.");
  if (next !== confirm) return fail("Passwords do not match.");
  if (next === current) return fail("Choose a password different from the current one.");
  mutate((d) => {
    const x = d.users.find((y) => y.id === userId)!;
    x.password = next;
    x.mustChangePassword = false;
  });
  return ok();
}

export function endSession(sessionId: string) {
  mutate((d) => {
    d.sessions = d.sessions.filter((s) => s.id !== sessionId);
  });
}

/* ========================== skill assessment (M2) ========================== */

export function questionsFor(technologies: string[], experience: string): BankQuestion[] {
  const levels =
    experience === "Beginner" ? ["Beginner", "Intermediate"] : experience === "Advanced" ? ["Intermediate", "Advanced"] : ["Beginner", "Intermediate", "Advanced"];
  return technologies.flatMap((t) => QUESTION_BANK.filter((q) => q.technology === t && levels.includes(q.level)));
}

export function emptyIntake(): IntakeAnswers {
  return {
    level: "",
    workTypes: [],
    roles: [],
    rolesNotSure: false,
    skills: [],
    noSkills: false,
    perSkill: {},
    projectKind: "",
    projectDescription: "",
    contribution: "",
    contributionSkills: [],
    contributionNA: false,
    lessConfident: [],
    lessConfidentNotSure: false,
    lessConfidentNotes: "",
  };
}

/** Returns the first problem with the intake answers, or null when every required question is answered. */
export function validateIntake(i: IntakeAnswers): string | null {
  if (!i.level) return "Answer question 1.";
  if (!i.workTypes.length) return "Answer question 2: choose at least one type of work.";
  if (!i.rolesNotSure && !i.roles.length) return "Answer question 3: choose up to three roles, or Not sure yet.";
  if (!i.noSkills && !i.skills.length) return "Answer question 4: choose your skills, or say you have not learned any yet.";
  if (!i.noSkills) {
    for (const s of i.skills) {
      const a = i.perSkill[s];
      if (!a?.ability || !a.duration || !a.lastUsed) return `Answer questions 5–7 for ${s}.`;
    }
  }
  if (!i.projectKind) return "Answer question 8.";
  const hasProjects = i.projectKind !== INTAKE_NO_PROJECTS;
  if (hasProjects && !i.projectDescription.trim()) return "Question 8: briefly describe your experience.";
  if (i.projectDescription.length > INTAKE_DESCRIPTION_MAX || i.contribution.length > INTAKE_DESCRIPTION_MAX || i.lessConfidentNotes.length > INTAKE_DESCRIPTION_MAX) return `Keep written answers within ${INTAKE_DESCRIPTION_MAX} characters.`;
  if (hasProjects && !i.contributionNA && (!i.contribution.trim() || !i.contributionSkills.length)) return "Answer question 9: describe your contribution and choose the skills you used.";
  if (!i.noSkills && !i.lessConfidentNotSure && !i.lessConfident.length) return "Answer question 10: choose the skills you feel less confident about, or Not sure yet.";
  return null;
}

/** Maps the intake answers onto the profile the quiz and report already use. */
export function intakeToProfile(i: IntakeAnswers): ExpertiseProfileInput {
  const experience = i.level === "Complete beginner" || i.level === "Currently learning" ? "Beginner" : i.level === "Have professional work experience" ? "Advanced" : i.level ? "Intermediate" : "";
  const abilityScores = i.skills.map((s) => INTAKE_ABILITY.indexOf(i.perSkill[s]?.ability ?? "")).filter((n) => n >= 0);
  const avg = abilityScores.length ? abilityScores.reduce((a, b) => a + b, 0) / abilityScores.length : 0;
  const confidence = avg >= 2.5 ? "Very confident" : avg >= 1.5 ? "Confident" : avg >= 0.5 ? "Somewhat confident" : "Not confident";
  const interests = i.workTypes.length ? `Interested in ${i.workTypes.join(", ")}.` : "";
  return {
    joiningRole: i.rolesNotSure || !i.roles.length ? "Other" : i.roles[0],
    technologies: i.noSkills ? [] : i.skills,
    experience,
    confidence,
    improvements: i.lessConfidentNotSure || !i.lessConfident.length ? ["Not sure yet"] : i.lessConfident,
    goals: [interests, i.rolesNotSure ? "Roles: not sure yet." : i.roles.length ? `Roles: ${i.roles.join(", ")}.` : ""].filter(Boolean).join(" "),
  };
}

export interface ExpertiseProfileInput {
  joiningRole: string;
  technologies: string[];
  experience: string;
  confidence: string;
  improvements: string[];
  goals: string;
}

/*
 * Skill-analysis service (mock). In production the backend and the AI service (OpenRouter) own
 * every rule below: per-technology status, gaps, required skills per role and course suggestions.
 * These local rules are a placeholder, not a requirement, and are never shown as thresholds in the UI.
 */
const MOCK_REQUIRED_BY_ROLE: Record<string, string[]> = {
  Frontend: ["HTML & CSS", "JavaScript", "TypeScript", "React", "Next.js", "Git", "Testing"],
  Backend: ["JavaScript", "TypeScript", "Node.js", "NestJS", "SQL", "PostgreSQL", "Git", "Testing"],
  "Full Stack": ["JavaScript", "TypeScript", "React", "Next.js", "Node.js", "NestJS", "SQL", "Git"],
  "Software Engineer": ["JavaScript", "TypeScript", "SQL", "Git", "Testing"],
  QA: ["JavaScript", "Testing", "SQL", "Git"],
  DevOps: ["Docker", "Git", "Node.js", "SQL"],
  Other: ["JavaScript", "Git"],
};

/** What the skill-analysis service returns for one report: strengths, gaps, required skills and suggested courses. */
export function skillAnalysis(db: DB, ev: ExpertiseEvaluation) {
  const strong = ev.results.filter((r) => r.status === "Strong").map((r) => r.technology);
  const gaps = ev.results.filter((r) => r.status !== "Strong");
  const required = MOCK_REQUIRED_BY_ROLE[ev.joiningRole] ?? MOCK_REQUIRED_BY_ROLE.Other;
  const missing = required.filter((r) => !ev.technologies.includes(r));
  const recommended = db.courses.filter((c) => c.covers.some((t) => gaps.some((g) => g.technology === t) || missing.includes(t)));
  return { strong, gaps, required, missing, recommended };
}

/** Mock scoring (placeholder for the skill-analysis service). */
export function scoreEvaluation(profile: ExpertiseProfileInput, answers: Record<string, number | null>) {
  const qs = questionsFor(profile.technologies, profile.experience);
  const results: TechResult[] = profile.technologies.map((t) => {
    const tq = qs.filter((q) => q.technology === t);
    const skipped = tq.filter((q) => answers[q.id] == null).length;
    const correct = tq.filter((q) => answers[q.id] === q.answer).length;
    // A technology with no questions, or every question skipped, is Not assessed (SRS FR-SKL-04 Assumption).
    if (!tq.length || skipped === tq.length) return { technology: t, correct: 0, total: tq.length, skipped, status: "Not assessed", priority: "High" };
    const p = correct / tq.length;
    if (p >= 0.8) return { technology: t, correct, total: tq.length, skipped, status: "Strong", priority: "Low" };
    if (p >= 0.6) return { technology: t, correct, total: tq.length, skipped, status: "Developing", priority: "Medium" };
    return { technology: t, correct, total: tq.length, skipped, status: "Needs revision", priority: "High" };
  });
  const score = results.reduce((s, r) => s + r.correct, 0);
  const total = results.reduce((s, r) => s + r.total, 0);
  const p = total ? score / total : 0;
  return {
    results,
    score,
    total,
    level: p >= 0.8 ? "Advanced" : p >= 0.6 ? "Intermediate" : "Beginner",
    answers: qs.map((q) => ({ technology: q.technology, questionId: q.id, answer: answers[q.id] == null ? null : String(answers[q.id]), correct: answers[q.id] === q.answer, skipped: answers[q.id] == null })),
  };
}

export function submitEvaluation(traineeUserId: string, profile: ExpertiseProfileInput, answers: Record<string, number | null>, practicalAnswer: string, intake?: IntakeAnswers, proctoring?: ProctoringRecord): Result<ExpertiseEvaluation> {
  const db = getDB();
  const s = scoreEvaluation(profile, answers);
  const version = (latestEvaluation(db, traineeUserId)?.version ?? 0) + 1;
  // The PM sets the total marks; they are shared equally across the questions.
  const marksPerQuestion = proctoring?.totalMarks != null && s.total > 0 ? Math.round((proctoring.totalMarks / s.total) * 100) / 100 : undefined;
  const scored: ProctoringRecord | undefined = proctoring && marksPerQuestion != null ? { ...proctoring, marksPerQuestion, marksObtained: Math.round(s.score * (proctoring.totalMarks! / s.total) * 100) / 100 } : proctoring;
  const ev: ExpertiseEvaluation = { id: uid("ev"), traineeUserId, version, ...profile, practicalAnswer, ...(intake ? { intake } : {}), ...(scored ? { proctoring: scored } : {}), level: s.level, score: s.score, total: s.total, results: s.results, answers: s.answers, createdAt: nowIso() };
  const t = traineeOf(db, traineeUserId);
  mutate((d) => {
    d.evaluations.push(ev);
    d.retakeRequests.filter((r) => r.traineeUserId === traineeUserId && r.status === "APPROVED").forEach((r) => (r.status = "USED"));
    if (t) notify(d, t.pmId, "Skill report submitted", "New skill report", `${nameOf(d, traineeUserId)} submitted a skill report (v${version}).`, `/pm/trainees/${traineeUserId}`);
  });
  return ok(ev);
}

/* ================= skill assessment retake approval ================= */

export function latestRetake(db: DB, traineeUserId: string) {
  return db.retakeRequests.filter((r) => r.traineeUserId === traineeUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/** A user may only retake the skill assessment with an approved, unused request. */
export function hasApprovedRetake(db: DB, traineeUserId: string) {
  return db.retakeRequests.some((r) => r.traineeUserId === traineeUserId && r.status === "APPROVED");
}

/** The user asks their PM to allow a retake; the PM is notified and decides in a pop-up. */
export function requestRetake(traineeUserId: string): Result<string> {
  const db = getDB();
  const t = traineeOf(db, traineeUserId);
  if (!t) return fail("User not found.");
  const last = latestRetake(db, traineeUserId);
  if (last?.status === "PENDING") return fail("Your retake request is already waiting for your PM.");
  if (last?.status === "APPROVED") return fail("Your retake is already approved. You can start it now.");
  const id = uid("rr");
  mutate((d) => {
    d.retakeRequests.push({ id, traineeUserId, status: "PENDING", createdAt: nowIso() });
    notify(d, t.pmId, "Retake request", "Retake approval needed", `${nameOf(d, traineeUserId)} (${t.traineeId}) wants to retake the skill assessment.`, undefined, id);
  });
  return ok(id);
}

/** The PM approves (with the time allowed and total marks) or rejects a pending retake request. */
export function decideRetake(pmId: string, requestId: string, approve: boolean, input?: { minutes: number; totalMarks: number }): Result {
  const db = getDB();
  const req = db.retakeRequests.find((r) => r.id === requestId);
  if (!req) return fail("This request no longer exists.");
  if (!inScope(db, pmId, req.traineeUserId)) return fail("This user is not in your scope.");
  if (req.status !== "PENDING") return fail("This request was already decided.");
  if (approve) {
    const err = assessmentSettingsError({ skillAssessmentMinutes: input?.minutes ?? NaN, skillAssessmentMarks: input?.totalMarks ?? NaN });
    if (err) return fail(err);
  }
  mutate((d) => {
    const r = d.retakeRequests.find((x) => x.id === requestId)!;
    const t = d.trainees.find((x) => x.userId === r.traineeUserId)!;
    r.status = approve ? "APPROVED" : "REJECTED";
    r.decidedBy = pmId;
    r.decidedAt = nowIso();
    if (approve && input) {
      r.minutes = input.minutes;
      r.totalMarks = input.totalMarks;
      t.skillAssessmentMinutes = input.minutes;
      t.skillAssessmentMarks = input.totalMarks;
    }
    d.notifications.filter((n) => n.requestId === requestId).forEach((n) => (n.readAt ??= nowIso()));
    notify(
      d,
      r.traineeUserId,
      "Retake decided",
      approve ? "Retake approved" : "Retake request rejected",
      approve ? `Your PM approved your retake: ${input!.minutes} minutes, ${input!.totalMarks} marks.` : "Your PM did not approve a retake this time.",
      approve ? "/trainee/onboarding" : "/trainee/skill-analysis",
    );
  });
  return ok();
}

/* ======================== directory & teams (M3) ======================== */

export interface TraineeInput {
  traineeId: string;
  name: string;
  email: string;
  tempPassword?: string;
  position: Position;
  attendanceMode: AttendanceMode;
  resource: Resource;
  onboardDate: string;
  /** Departure date (ISO). Empty is allowed only for a reactivated user whose date is not set yet. */
  periodEnd: string;
  /** Time (minutes) and total marks for the first-login skill assessment. */
  skillAssessmentMinutes: number;
  skillAssessmentMarks: number;
  teamIds: string[];
}

function assessmentSettingsError(input: Pick<TraineeInput, "skillAssessmentMinutes" | "skillAssessmentMarks">): string | null {
  if (!Number.isInteger(input.skillAssessmentMinutes) || input.skillAssessmentMinutes < 1 || input.skillAssessmentMinutes > 180) return "Skill assessment time must be a whole number of minutes (1–180).";
  if (!Number.isInteger(input.skillAssessmentMarks) || input.skillAssessmentMarks < 1 || input.skillAssessmentMarks > 1000) return "Skill assessment marks must be a whole number (1–1000).";
  return null;
}

export function createTrainee(pmId: string, input: TraineeInput): Result {
  const db = getDB();
  if (!input.traineeId.trim() || !input.name.trim() || !input.email.trim() || !input.onboardDate) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (!input.tempPassword || input.tempPassword.length < 8) return fail("Temporary password must be at least 8 characters.");
  if (!input.teamIds.length) return fail("Choose at least one team.");
  const settingsError = assessmentSettingsError(input);
  if (settingsError) return fail(settingsError);
  if (!input.periodEnd) return fail("Choose a departure date.");
  if (input.periodEnd <= input.onboardDate) return fail("The departure date must be after the onboarding date.");
  if (db.trainees.some((t) => t.traineeId.toLowerCase() === input.traineeId.trim().toLowerCase())) return fail("A user with this ID already exists.");
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const id = uid("u");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "TRAINEE", password: input.tempPassword!, mustChangePassword: true, emailVerified: true, createdAt: nowIso() });
    d.trainees.push({ userId: id, traineeId: input.traineeId.trim().toUpperCase(), position: input.position, attendanceMode: input.attendanceMode, resource: input.resource, onboardDate: input.onboardDate, periodEnd: input.periodEnd, skillAssessmentMinutes: input.skillAssessmentMinutes, skillAssessmentMarks: input.skillAssessmentMarks, skills: [], teamIds: input.teamIds, pmId, hideFromLeaderboard: false });
  });
  return ok();
}

export function updateTrainee(pmId: string, userId: string, input: TraineeInput): Result {
  const db = getDB();
  if (!input.name.trim() || !input.email.trim() || !input.onboardDate) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (!input.teamIds.length) return fail("Choose at least one team.");
  const cur = db.trainees.find((t) => t.userId === userId);
  const settingsErr = assessmentSettingsError(input);
  if (settingsErr) return fail(settingsErr);
  if (cur?.archivedAt && (!input.periodEnd || input.periodEnd <= todayISO())) return fail("Set a new departure date after today to move this user back to All Users.");
  if (!input.periodEnd) {
    if (cur?.periodEnd) return fail("Choose a departure date.");
  } else {
    if (input.periodEnd <= input.onboardDate) return fail("The departure date must be after the onboarding date.");
    if (cur && cur.periodEnd !== input.periodEnd && input.periodEnd <= todayISO()) return fail("The departure date has already passed. Choose a date after today.");
  }
  if (db.trainees.some((t) => t.userId !== userId && t.traineeId.toLowerCase() === input.traineeId.trim().toLowerCase())) return fail("A user with this ID already exists.");
  if (db.users.some((u) => u.id !== userId && u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  mutate((d) => {
    const u = d.users.find((x) => x.id === userId)!;
    const t = d.trainees.find((x) => x.userId === userId)!;
    const wasArchived = !!t.archivedAt;
    u.name = input.name.trim();
    u.email = input.email.trim();
    if (input.tempPassword) {
      u.password = input.tempPassword;
      u.mustChangePassword = true;
    }
    Object.assign(t, { traineeId: input.traineeId.trim().toUpperCase(), position: input.position, attendanceMode: input.attendanceMode, resource: input.resource, onboardDate: input.onboardDate, periodEnd: input.periodEnd, skillAssessmentMinutes: input.skillAssessmentMinutes, skillAssessmentMarks: input.skillAssessmentMarks, teamIds: input.teamIds });
    if (wasArchived) {
      t.archivedAt = undefined; // a new departure date reactivates the user
    }
  });
  return ok();
}

/** Moves every active trainee whose period has ended to the Archive. Returns how many were archived. */
export function archiveExpiredTrainees(): number {
  const today = todayISO();
  // An empty periodEnd means no end date is set (reactivated user): never auto-archived.
  const expired = (t: { archivedAt?: string; periodEnd: string }) => !t.archivedAt && !!t.periodEnd && t.periodEnd <= today;
  if (!getDB().trainees.some(expired)) return 0;
  let n = 0;
  mutate((d) => {
    for (const t of d.trainees) {
      if (!expired(t)) continue;
      t.archivedAt = today;
      n++;
    }
    d.sessions = d.sessions.filter((s) => !d.trainees.some((t) => t.userId === s.userId && t.archivedAt));
  });
  return n;
}

export function createPM(creatorId: string, input: { name: string; email: string; pmCode: string; password: string }): Result {
  const db = getDB();
  if (!input.name.trim() || !input.pmCode.trim()) return fail("Fill in every required field.");
  if (!isEmail(input.email)) return fail("Enter a valid email address.");
  if (input.password.length < 8) return fail("Password must be at least 8 characters.");
  const code = input.pmCode.trim().toUpperCase();
  if (db.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail("An account with this email already exists.");
  if (db.users.some((u) => u.pmCode?.toLowerCase() === code.toLowerCase()) || db.trainees.some((t) => t.traineeId.toLowerCase() === code.toLowerCase())) return fail("This ID is already in use.");
  mutate((d) => {
    const id = uid("pm");
    d.users.push({ id, name: input.name.trim(), email: input.email.trim(), role: "PM", pmCode: code, password: input.password, mustChangePassword: false, emailVerified: true, createdAt: nowIso() });
    d.notificationPrefs.push(...d.notificationPrefs.filter((p) => p.userId === "pm1").map((p) => ({ ...p, userId: id, showInBell: true })));
  });
  return ok();
}

export function createTeam(pmId: string, name: string): Result {
  if (!name.trim()) return fail("Enter a team name.");
  if (getDB().teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) return fail("A team with this name already exists.");
  mutate((d) => {
    d.teams.push({ id: uid("t"), name: name.trim(), pmId });
  });
  return ok();
}

export function saveFeedback(pmId: string, traineeUserId: string, text: string): Result {
  if (!text.trim()) return fail("Feedback cannot be empty.");
  mutate((d) => {
    const prev = d.feedback.filter((f) => f.traineeUserId === traineeUserId).sort((a, b) => b.version - a.version)[0];
    d.feedback.push({ id: uid("f"), traineeUserId, authorId: pmId, text: text.trim(), version: (prev?.version ?? 0) + 1, createdAt: nowIso() });
  });
  return ok();
}

/* ============================ courses (M4) ============================ */

export function approveSuggestion(pmId: string, traineeUserId: string, courseId: string) {
  mutate((d) => {
    if (!d.suggestionApprovals.some((s) => s.traineeUserId === traineeUserId && s.courseId === courseId))
      d.suggestionApprovals.push({ traineeUserId, courseId, approvedBy: pmId, approvedAt: todayISO() });
  });
}

export function assignCourse(pmId: string, courseId: string, target: { traineeIds?: string[]; teamId?: string }, dueDate?: string, source: Assignment["source"] = "DIRECT"): Result<number> {
  const db = getDB();
  const c = courseById(db, courseId);
  if (!c) return fail("Course not found.");
  if (dueDate && dueDate < todayISO()) return fail("Due date cannot be in the past.");
  const ids = target.teamId ? pmTrainees(db, pmId).filter((t) => t.teamIds.includes(target.teamId!)).map((t) => t.userId) : target.traineeIds ?? [];
  if (!ids.length) return fail("Choose a user or a team.");
  const v = publishedVersion(c);
  let n = 0;
  mutate((d) => {
    for (const tid of ids) {
      if (d.assignments.some((a) => a.traineeUserId === tid && a.courseId === courseId)) continue;
      d.assignments.push({ id: uid("as"), traineeUserId: tid, courseId, courseVersionId: v.id, assignedBy: pmId, assignedAt: todayISO(), dueDate: dueDate || undefined, source: target.teamId ? "TEAM" : source });
      notify(d, tid, "Course assigned", "Course assigned", `${c.title} was assigned to you${dueDate ? ` (due ${dueDate})` : ""}.`, "/trainee/roadmap");
      n++;
    }
  });
  if (!n) return fail("Already assigned to everyone selected.");
  return ok(n);
}

export function requestCourse(traineeUserId: string, courseId: string, reason: string): Result {
  const db = getDB();
  if (!reason.trim()) return fail("Tell your PM why you need this course.");
  if (db.courseRequests.some((r) => r.traineeUserId === traineeUserId && r.courseId === courseId && r.status !== "DECLINED")) return fail("An active request already exists for this course.");
  if (db.assignments.some((a) => a.traineeUserId === traineeUserId && a.courseId === courseId)) return fail("This course is already assigned to you.");
  const t = traineeOf(db, traineeUserId);
  mutate((d) => {
    d.courseRequests.push({ id: uid("cr"), traineeUserId, courseId, reason: reason.trim(), status: "PENDING", createdAt: todayISO() });
    if (t) notify(d, t.pmId, "Course request", "New course request", `${nameOf(d, traineeUserId)} requested ${courseById(d, courseId)?.title}.`, "/pm/courses");
  });
  return ok();
}

/** The PM approves (assigns the course, source REQUEST) or declines a pending course request. Decided once, in scope only. */
export function decideCourseRequest(pmId: string, requestId: string, approve: boolean): Result {
  const db = getDB();
  const r = db.courseRequests.find((x) => x.id === requestId);
  if (!r) return fail("This request no longer exists.");
  if (!inScope(db, pmId, r.traineeUserId)) return fail("This user is not in your scope.");
  if (r.status !== "PENDING") return fail("This request was already decided.");
  const course = courseById(db, r.courseId);
  if (!course) return fail("Course not found.");
  const alreadyAssigned = db.assignments.some((a) => a.traineeUserId === r.traineeUserId && a.courseId === r.courseId);
  mutate((d) => {
    const x = d.courseRequests.find((y) => y.id === requestId)!;
    x.status = approve ? "APPROVED" : "DECLINED";
    x.reviewedBy = pmId;
    x.reviewedAt = todayISO();
    if (approve && !alreadyAssigned) {
      d.assignments.push({ id: uid("as"), traineeUserId: x.traineeUserId, courseId: x.courseId, courseVersionId: publishedVersion(course).id, assignedBy: pmId, assignedAt: todayISO(), source: "REQUEST" });
    }
    notify(d, x.traineeUserId, "Course request decided", `Course request ${approve ? "approved" : "declined"}`, `${course.title}: ${approve ? "approved and added to your roadmap" : "declined"}.`, "/trainee/roadmap");
  });
  return ok();
}

export function addCourse(pmId: string, input: { title: string; track: string; description: string; topics: string; resources: string }): Result {
  const db = getDB();
  if (!input.title.trim()) return fail("Enter a course name.");
  if (db.courses.some((c) => c.title.toLowerCase() === input.title.trim().toLowerCase())) return fail("A course with this name already exists.");
  const topics = input.topics.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!topics.length) return fail("Add at least one roadmap topic (one per line).");
  const resources = input.resources.split("\n").map((s) => s.trim()).filter(Boolean);
  const bad = resources.find((r) => !isHttpsUrl(r));
  if (bad) return fail(`Resource URLs must use HTTPS: ${bad}`);
  const id = uid("c");
  mutate((d) => {
    d.courses.push({
      id,
      title: input.title.trim(),
      track: input.track,
      description: input.description.trim(),
      source: "PM_ADDED",
      createdBy: pmId,
      covers: [],
      versions: [
        {
          id: `${id}-v1`,
          version: "1.0",
          status: "PUBLISHED",
          approvedBy: pmId,
          approvedAt: todayISO(),
          topics: topics.map((name, i) => ({
            id: `${id}-t${i + 1}`,
            name,
            order: i + 1,
            prerequisites: i ? [`${id}-t${i}`] : [],
            outcomes: [`Explain ${name}`, `Apply ${name} in a task`],
            subtopics: [
              { id: `${id}-t${i + 1}-s1`, name: `${name} — overview`, theory: "Lesson content to be authored by the PM.", example: "Example to be added.", pseudocode: "// to be added", resources },
            ],
          })),
        },
      ],
    });
  });
  return ok();
}

/* ============================ learning (M5) ============================ */

export function completeSubtopic(traineeUserId: string, subtopicId: string) {
  mutate((d) => {
    if (!d.subtopicProgress.some((p) => p.traineeUserId === traineeUserId && p.subtopicId === subtopicId))
      d.subtopicProgress.push({ traineeUserId, subtopicId, completedAt: todayISO() });
  });
}

/** Personal topic state. MASTERED is set only by the PM when finalising an assessment (FR-ASM-06). */
export function setTopicState(traineeUserId: string, topicId: string, state: Exclude<TopicStateValue, "MASTERED">) {
  mutate((d) => {
    const s = d.topicStates.find((x) => x.traineeUserId === traineeUserId && x.topicId === topicId);
    if (s?.state === "MASTERED") return;
    if (s) s.state = state;
    else d.topicStates.push({ traineeUserId, topicId, state });
  });
}

/* ============================ sprint (M6) ============================ */

export function validateTask(t: Pick<SprintTask, "title" | "plannedStart" | "plannedEnd" | "plannedHours" | "actualHours">): string | null {
  if (!t.title.trim()) return "Task title is required.";
  if (t.plannedStart && t.plannedEnd && t.plannedEnd <= t.plannedStart) return "Planned end must be after planned start.";
  if (t.plannedHours < 0 || t.actualHours < 0) return "Hours cannot be negative.";
  return null;
}

/** Queues the approval-request email to the L&D team / SBU a task was logged for. */
function requestOwnerApproval(d: DB, task: SprintTask, owner: { name: string; email: string }) {
  d.emailDeliveries.unshift({
    id: uid("em"),
    taskId: task.id,
    recipient: owner.email,
    subject: `Approval request: ${nameOf(d, task.traineeUserId)} created the task "${task.title.trim()}" for ${owner.name}`,
    // Provider is not connected in this build: delivery is recorded as failed with retry.
    status: d.integrations.find((x) => x.key === "EMAIL")?.status === "Connected" ? "ACCEPTED" : "FAILED",
    attempts: 1,
    createdAt: nowIso(),
  });
}

/**
 * Saves a sprint task. A task created for an L&D team or SBU is added to the sprint at once with status
 * PENDING and an approval-request email goes to that owner; the PM hears back when the owner replies
 * (or, if there is no reply after a day, via `alertStaleOwnerApprovals`). Changing the task's title,
 * description, category or owner sends a new request.
 */
export function saveTask(task: SprintTask): Result {
  const err = validateTask(task);
  if (err) return fail(err);
  mutate((d) => {
    const i = d.sprintTasks.findIndex((x) => x.id === task.id);
    const prev = i >= 0 ? d.sprintTasks[i] : undefined;
    const owner = task.ownerId ? d.taskOwners.find((o) => o.id === task.ownerId) : undefined;
    const changed = !prev || prev.ownerId !== task.ownerId || prev.title !== task.title || prev.description !== task.description || prev.category !== task.category;
    let next: SprintTask = task;
    if (!owner) next = { ...task, verification: undefined, ownerRequestedAt: undefined, pendingAlertSent: undefined };
    else if (changed) next = { ...task, verification: "PENDING", ownerRequestedAt: nowIso(), pendingAlertSent: false };
    else next = { ...task, verification: prev?.verification, ownerRequestedAt: prev?.ownerRequestedAt, pendingAlertSent: prev?.pendingAlertSent };
    if (i >= 0) d.sprintTasks[i] = next;
    else d.sprintTasks.push(next);
    if (owner && changed) requestOwnerApproval(d, next, owner);
  });
  return ok();
}

/** Stand-in for the owner's reply to the approval email (the real reply arrives through the L&D/SBU API). */
export function verifyTaskOwner(pmId: string, taskId: string, status: Exclude<TaskVerification, "PENDING">): Result {
  const task = getDB().sprintTasks.find((x) => x.id === taskId);
  if (!task || !task.ownerId) return fail("This task has no owner to approve it.");
  if (!inScope(getDB(), pmId, task.traineeUserId)) return fail("This user is not in your scope.");
  if (task.verification !== "PENDING") return fail("The owner has already replied about this task.");
  mutate((d) => {
    const x = d.sprintTasks.find((y) => y.id === taskId)!;
    const owner = d.taskOwners.find((o) => o.id === x.ownerId);
    x.verification = status;
    const approved = status === "VERIFIED";
    const t = traineeOf(d, x.traineeUserId);
    const link = "/pm/trainees/" + x.traineeUserId;
    notify(d, t?.pmId ?? pmId, "Sprint awaiting review", approved ? "Task approved by owner" : "Task declined by owner", `${owner?.name ?? "Owner"} ${approved ? "approved" : "declined"} "${x.title}" (${nameOf(d, x.traineeUserId)}).`, link);
    if (!approved) notify(d, x.traineeUserId, "Sprint awaiting review", "Task declined", `${owner?.name ?? "The owner"} declined "${x.title}". Check with them or update the task.`, "/trainee/daily-sprint");
  });
  return ok();
}

const DAY_MS = 24 * 60 * 60 * 1000;
const staleApproval = (t: SprintTask) => t.verification === "PENDING" && !!t.ownerRequestedAt && Date.now() - Date.parse(t.ownerRequestedAt) >= DAY_MS;

/** Tasks whose owner has not replied for a day or more. */
export function staleApprovalTasks(db: DB) {
  return db.sprintTasks.filter(staleApproval);
}

/** Tells each PM once about tasks that are still awaiting an owner's approval after a day. */
export function alertStaleOwnerApprovals(): number {
  const pending = getDB().sprintTasks.filter((t) => staleApproval(t) && !t.pendingAlertSent);
  if (!pending.length) return 0;
  mutate((d) => {
    for (const x of d.sprintTasks.filter((t) => staleApproval(t) && !t.pendingAlertSent)) {
      x.pendingAlertSent = true;
      const t = traineeOf(d, x.traineeUserId);
      const owner = d.taskOwners.find((o) => o.id === x.ownerId);
      if (t) notify(d, t.pmId, "Sprint awaiting review", "Task approval still pending", `${owner?.name ?? "The owner"} has not replied about "${x.title}" (${nameOf(d, x.traineeUserId)}) for over a day.`, "/pm/trainees/" + x.traineeUserId);
    }
  });
  return pending.length;
}

export function deleteTask(id: string) {
  mutate((d) => {
    d.sprintTasks = d.sprintTasks.filter((t) => t.id !== id);
  });
}

/** Incomplete tasks from the last working day carry forward to today (FR-DS-03). */
export function carryForward(traineeUserId: string) {
  const db = getDB();
  const today = todayISO();
  if (db.sprintTasks.some((t) => t.traineeUserId === traineeUserId && t.date === today && t.carriedFrom)) return;
  const prevDates = [...new Set(db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date < today).map((t) => t.date))].sort();
  const last = prevDates[prevDates.length - 1];
  if (!last) return;
  const open = db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date === last && !t.done);
  if (!open.length) return;
  mutate((d) => {
    for (const t of open) {
      if (d.sprintTasks.some((x) => x.traineeUserId === traineeUserId && x.date === today && x.carriedFrom === t.id)) continue;
      d.sprintTasks.push({ ...t, id: uid("st"), date: today, actualHours: 0, done: false, carriedFrom: t.id });
    }
  });
}

export function submitSprint(traineeUserId: string): Result<{ onTime: boolean }> {
  const db = getDB();
  const today = todayISO();
  if (db.sprintSubmissions.some((s) => s.traineeUserId === traineeUserId && s.date === today)) return fail("Today's sprint is already recorded");
  const tasks = db.sprintTasks.filter((t) => t.traineeUserId === traineeUserId && t.date === today);
  if (!tasks.length) return fail("Add your own sprint task before submitting");
  const onTime = nowHHMM() <= db.xpRules.sprintCutoff;
  const t = traineeOf(db, traineeUserId);
  mutate((d) => {
    d.sprintSubmissions.push({ traineeUserId, date: today, time: nowIso(), onTime });
    // Sprint XP stays pending until PM verification; late submissions earn no on-time XP.
    if (onTime) addXp(d, { traineeUserId, source: "On-time sprint", amount: d.xpRules.onTimeSprint, status: "PENDING", key: `sprint:${traineeUserId}:${today}`, evidence: `Sprint submitted ${nowHHMM()}`, date: today });
    // Write into the team DS sheet for the current week.
    const ws = weekStartOf(today);
    for (const teamId of t?.teamIds ?? []) {
      const weekId = weekIdFor(teamId, ws);
      if (!d.sprintWeeks.some((w) => w.id === weekId)) continue;
      const prevDay = [...new Set(d.sprintTasks.filter((x) => x.traineeUserId === traineeUserId && x.date < today).map((x) => x.date))].sort().pop();
      const put = (column: DSColumn, value: string) => {
        if (!value) return;
        const id = `${weekId}|${traineeUserId}|${today}|${column}`;
        if (d.dsCells.some((c) => c.id === id)) return;
        d.dsCells.push({ id, weekId, traineeUserId, date: today, column, value, authorId: traineeUserId, createdAt: nowIso(), updatedBy: traineeUserId, updatedAt: nowIso(), history: [] });
      };
      put("YESTERDAY", d.sprintTasks.filter((x) => x.traineeUserId === traineeUserId && x.date === prevDay && x.done).map((x) => x.title).join("; "));
      put("HOURS", String(tasks.reduce((s, x) => s + x.plannedHours, 0)));
      put("TODAY", tasks.map((x) => x.title).join("; "));
      put("BLOCKERS", tasks.map((x) => x.blocker).filter(Boolean).join("; "));
    }
    const blockers = tasks.filter((x) => x.blocker);
    if (t && blockers.length) notify(d, t.pmId, "Sprint awaiting review", "Sprint blocker", `${nameOf(d, traineeUserId)} reported: ${blockers[0].blocker}`, "/pm/daily-sprints");
  });
  return ok({ onTime });
}

export function addSprintWeek(pmId: string, teamId: string): Result<string> {
  const db = getDB();
  const weeks = db.sprintWeeks.filter((w) => w.teamId === teamId).map((w) => w.weekStart).sort();
  const next = weeks.length ? addDays(weeks[weeks.length - 1], 7) : weekStartOf(todayISO());
  mutate((d) => {
    d.sprintWeeks.push({ id: weekIdFor(teamId, next), teamId, weekStart: next });
  });
  return ok(next);
}

/**
 * Save a DS cell with optimistic locking (SRS §4). `baseUpdatedAt` is what the editor
 * last saw; if the cell changed since, a conflict is returned for the dialog.
 */
export function saveDSCell(
  editorId: string,
  weekId: string,
  traineeUserId: string,
  date: string,
  column: DSColumn,
  value: string,
  baseUpdatedAt?: string,
): { ok: true } | { ok: false; conflict: DSCell } {
  const existing = dsCell(getDB(), weekId, traineeUserId, date, column);
  if (existing && baseUpdatedAt && existing.updatedAt !== baseUpdatedAt) return { ok: false, conflict: existing };
  mutate((d) => {
    const id = `${weekId}|${traineeUserId}|${date}|${column}`;
    const c = d.dsCells.find((x) => x.id === id);
    if (c) {
      if (c.value === value) return;
      c.history.push({ value: c.value, by: c.updatedBy, at: c.updatedAt });
      c.value = value;
      c.updatedBy = editorId;
      c.updatedAt = nowIso();
    } else if (value) {
      d.dsCells.push({ id, weekId, traineeUserId, date, column, value, authorId: editorId, createdAt: nowIso(), updatedBy: editorId, updatedAt: nowIso(), history: [] });
    }
  });
  return { ok: true };
}

/** Demo helper: simulate the trainee editing the same cell to show the conflict dialog. */
export function simulateTraineeEdit(weekId: string, traineeUserId: string, date: string, column: DSColumn, value: string) {
  saveDSCell(traineeUserId, weekId, traineeUserId, date, column, value);
}

/* ============================ assessments (M7) ============================ */

export function attemptsFor(db: DB, traineeUserId: string, setId: string) {
  return db.attempts.filter((a) => a.traineeUserId === traineeUserId && a.questionSetId === setId);
}

export function submitAttempt(
  traineeUserId: string,
  setId: string,
  answers: Record<string, string>,
  reason: "SUBMITTED" | "TIME_UP" | "TAB_HIDDEN" | "OFFLINE",
  integrityEvents: IntegrityEvent[],
  startedAt: string,
): Result<string> {
  const db = getDB();
  const set = db.questionSets.find((s) => s.id === setId);
  if (!set) return fail("Assessment not found.");
  const prior = attemptsFor(db, traineeUserId, setId).length;
  if (prior >= set.attemptLimit) return fail("You have used every attempt for this assessment.");
  const mcq = set.questions.filter((q) => q.type === "MCQ");
  const score = mcq.filter((q) => answers[q.id] != null && Number(answers[q.id]) === q.answerKey).length;
  const id = uid("at");
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  const t = traineeOf(db, traineeUserId);
  mutate((d) => {
    d.attempts.push({
      id,
      traineeUserId,
      questionSetId: setId,
      attemptNo: prior + 1,
      answers,
      objectiveScore: score,
      objectiveTotal: mcq.length,
      status: offline ? "PENDING_OFFLINE" : "PROVISIONAL",
      submitReason: offline ? "OFFLINE" : reason,
      integrityEvents,
      startedAt,
      submittedAt: nowIso(),
    });
    if (t) notify(d, t.pmId, "Assessment submitted", "Assessment awaiting review", `${nameOf(d, traineeUserId)} submitted ${set.title}${reason === "TAB_HIDDEN" ? " (auto-submitted: tab hidden)" : ""}.`, `/pm/trainees/${traineeUserId}`);
  });
  return ok(id);
}

export function appealAttempt(traineeUserId: string, attemptId: string, reason: string): Result {
  if (!reason.trim()) return fail("Give a reason for your review request.");
  if (getDB().appeals.some((a) => a.attemptId === attemptId && a.status === "OPEN")) return fail("A review request is already open for this attempt.");
  mutate((d) => {
    d.appeals.push({ id: uid("ap"), attemptId, traineeUserId, reason: reason.trim(), status: "OPEN", createdAt: nowIso() });
    const t = d.trainees.find((x) => x.userId === traineeUserId);
    if (t) notify(d, t.pmId, "Appeal", "Assessment review requested", `${nameOf(d, traineeUserId)} requested a review: ${reason.trim()}`, `/pm/trainees/${traineeUserId}`);
  });
  return ok();
}

/** PM finalises a provisional result. Original objective score is preserved (FR-ASM-07). */
export function finaliseAttempt(pmId: string, attemptId: string, finalScore: number, mastered: boolean): Result {
  if (!Number.isFinite(finalScore) || finalScore < 0 || finalScore > 100) return fail("Score must be between 0 and 100.");
  const db = getDB();
  const att = db.attempts.find((x) => x.id === attemptId);
  if (!att) return fail("This attempt no longer exists.");
  if (!inScope(db, pmId, att.traineeUserId)) return fail("This user is not in your scope.");
  if (att.status === "FINAL") return fail("This result is already final.");
  mutate((d) => {
    const a = d.attempts.find((x) => x.id === attemptId)!;
    a.finalScore = finalScore;
    a.status = "FINAL";
    d.appeals.filter((x) => x.attemptId === attemptId).forEach((x) => (x.status = "RESOLVED"));
    const set = d.questionSets.find((s) => s.id === a.questionSetId)!;
    if (mastered) {
      if (set.topicId) {
        const s = d.topicStates.find((x) => x.traineeUserId === a.traineeUserId && x.topicId === set.topicId);
        if (s) s.state = "MASTERED";
        else d.topicStates.push({ traineeUserId: a.traineeUserId, topicId: set.topicId, state: "MASTERED" });
        addXp(d, { traineeUserId: a.traineeUserId, source: "Verified module", amount: d.xpRules.verifiedModule, status: "PENDING", key: `module:${a.traineeUserId}:${set.topicId}`, evidence: `${set.title} ${finalScore}%`, date: todayISO() });
      } else {
        const c = d.courses.find((x) => x.id === set.courseId);
        c?.versions[0].topics.forEach((tp) => {
          const s = d.topicStates.find((x) => x.traineeUserId === a.traineeUserId && x.topicId === tp.id);
          if (s) s.state = "MASTERED";
          else d.topicStates.push({ traineeUserId: a.traineeUserId, topicId: tp.id, state: "MASTERED" });
        });
        addXp(d, { traineeUserId: a.traineeUserId, source: "Final assessment", amount: d.xpRules.finalAssessment, status: "PENDING", key: `final:${a.traineeUserId}:${set.id}`, evidence: `${set.title} ${finalScore}%`, date: todayISO() });
      }
    }
    notify(d, a.traineeUserId, "Assessment result", "Assessment result finalised", `${set.title}: ${finalScore}%.`, "/trainee/roadmap");
  });
  return ok();
}

/* ======================== attendance & leave (M8) ======================== */

export function requestLeave(traineeUserId: string, input: { start: string; end: string; type: LeaveRequest["type"]; reason: string }): Result {
  if (!input.start || !input.end) return fail("Choose a start and end date.");
  if (input.end < input.start) return fail("End date cannot precede start date");
  if (!input.reason.trim()) return fail("Give a reason for your leave.");
  const t = traineeOf(getDB(), traineeUserId);
  mutate((d) => {
    d.leaveRequests.unshift({ id: uid("lr"), traineeUserId, ...input, reason: input.reason.trim(), status: "PENDING", createdAt: todayISO() });
    if (t) notify(d, t.pmId, "Leave request", "New leave request", `${nameOf(d, traineeUserId)} requested leave ${input.start} → ${input.end}.`, "/pm/attendance");
  });
  return ok();
}

export function decideLeave(pmId: string, id: string, approve: boolean, note: string): Result {
  if (!note.trim()) return fail("A note is required for the decision.");
  const db = getDB();
  const req = db.leaveRequests.find((x) => x.id === id);
  if (!req) return fail("This leave request no longer exists.");
  if (!inScope(db, pmId, req.traineeUserId)) return fail("This user is not in your scope.");
  if (req.status !== "PENDING") return fail("This leave request was already decided.");
  mutate((d) => {
    const l = d.leaveRequests.find((x) => x.id === id)!;
    l.status = approve ? "APPROVED" : "DECLINED";
    l.review = note.trim();
    l.reviewerId = pmId;
    l.reviewedAt = nowIso();
    notify(d, l.traineeUserId, "Leave decided", `Leave ${approve ? "approved" : "declined"}`, `${l.start} → ${l.end}: ${note.trim()}`, "/trainee/erp");
  });
  return ok();
}

export function addManualAttendance(pmId: string, input: Omit<AttendanceRecord, "id" | "source" | "syncedAt" | "hours" | "lateMinutes">): Result {
  if (!input.traineeUserId || !input.date || !input.entry) return fail("User, date and entry time are required.");
  if (!inScope(getDB(), pmId, input.traineeUserId)) return fail("This user is not in your scope.");
  if (input.exit && input.exit <= input.entry) return fail("Exit must be after entry.");
  if (getDB().attendance.some((a) => a.traineeUserId === input.traineeUserId && a.date === input.date)) return fail("A record already exists for this date. Use a reconciliation request instead.");
  const [eh, em] = input.entry.split(":").map(Number);
  const late = Math.max(0, eh * 60 + em - 9 * 60);
  let hours: number | undefined;
  if (input.exit) {
    const [xh, xm] = input.exit.split(":").map(Number);
    hours = Math.round(((xh * 60 + xm - (eh * 60 + em)) / 60) * 10) / 10;
  }
  mutate((d) => {
    d.attendance.push({ id: uid("ar"), ...input, exit: input.exit || undefined, lateMinutes: late, hours, source: "PM_ENTERED", syncedAt: nowIso() });
  });
  return ok();
}

export function requestReconciliation(traineeUserId: string, recordRef: string, reason: string): Result {
  if (!reason.trim()) return fail("Give a reason for the correction.");
  mutate((d) => {
    d.reconciliations.unshift({ id: uid("rc"), traineeUserId, recordRef, reason: reason.trim(), status: "OPEN", createdAt: nowIso() });
  });
  return ok();
}

export function resolveReconciliation(pmId: string, id: string): Result {
  const db = getDB();
  const rec = db.reconciliations.find((x) => x.id === id);
  if (!rec) return fail("This request no longer exists.");
  if (!inScope(db, pmId, rec.traineeUserId)) return fail("This user is not in your scope.");
  if (rec.status === "RESOLVED") return fail("This request is already resolved.");
  mutate((d) => {
    const r = d.reconciliations.find((x) => x.id === id)!;
    r.status = "RESOLVED";
  });
  return ok();
}

export function mapTeamsIdentity(pmId: string, recordId: string, traineeUserId: string): Result {
  const db = getDB();
  const rec = db.meetingAttendance.find((x) => x.id === recordId);
  if (!rec) return fail("This meeting record no longer exists.");
  if (rec.status !== "UNMAPPED") return fail("This identity is already mapped.");
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  mutate((d) => {
    const m = d.meetingAttendance.find((x) => x.id === recordId)!;
    m.traineeUserId = traineeUserId;
    m.status = "ATTENDED";
  });
  return ok();
}

/** Mock retry: integrations stay unavailable until real credentials exist on the server. */
export function retryIntegration(key: IntegrationKey) {
  mutate((d) => {
    const i = d.integrations.find((x) => x.key === key)!;
    if (i.status === "Disconnected" || i.status === "Authorization required") return;
    i.status = "Failed — retry available";
  });
}

/* ============================ reports (M9) ============================ */

export function reportPeriod(type: ReportPeriodType, anchor: string, onboardDate: string): [string, string] {
  if (type === "WEEKLY") {
    const s = weekStartOf(anchor);
    return [s, addDays(s, 6)];
  }
  // Bi-weekly: the picked week and the week before it (same as the Daily Sprints report).
  if (type === "BIWEEKLY") {
    const s = weekStartOf(anchor);
    return [addDays(s, -7), addDays(s, 6)];
  }
  if (type === "MONTHLY") {
    const [y, m] = anchor.split("-").map(Number);
    const end = new Date(y, m, 0).getDate();
    return [`${y}-${String(m).padStart(2, "0")}-01`, `${y}-${String(m).padStart(2, "0")}-${String(end).padStart(2, "0")}`];
  }
  return [onboardDate, anchor];
}

export function findReport(db: DB, traineeUserId: string, type: ReportPeriodType, start: string, end: string) {
  return db.reports.find((r) => r.traineeUserId === traineeUserId && r.periodType === type && r.periodStart === start && r.periodEnd === end);
}

export function ensureReport(traineeUserId: string, type: ReportPeriodType, start: string, end: string): Report {
  const existing = findReport(getDB(), traineeUserId, type, start, end);
  if (existing) return existing;
  const r: Report = { id: uid("rp"), traineeUserId, periodType: type, periodStart: start, periodEnd: end, sections: Object.fromEntries(REPORT_SECTIONS.map((s) => [s, ""])), notes: [], versions: [] };
  mutate((d) => {
    d.reports.push(r);
  });
  return r;
}

const nextReportVersion = (r: Report) => `${r.versions.length + 1}.0`;

/** Saves the PM's edited report copy as a new draft version; earlier versions stay in the picker (FR-RPT-04). */
export function saveReportSections(pmId: string, reportId: string, sections: Record<string, string>, note: string) {
  mutate((d) => {
    const r = d.reports.find((x) => x.id === reportId)!;
    r.sections = sections;
    if (note.trim()) r.notes.unshift({ text: note.trim(), at: nowIso() });
    r.versions.push({ version: nextReportVersion(r), sections: { ...sections }, savedBy: pmId, savedAt: nowIso() });
  });
}

/** Publishes the current report copy. Unsaved or unchanged content becomes (or reuses) the latest version. */
export function publishReport(pmId: string, reportId: string) {
  mutate((d) => {
    const r = d.reports.find((x) => x.id === reportId)!;
    let v = r.versions[r.versions.length - 1];
    if (!v || JSON.stringify(v.sections) !== JSON.stringify(r.sections)) {
      v = { version: nextReportVersion(r), sections: { ...r.sections }, savedBy: pmId, savedAt: nowIso() };
      r.versions.push(v);
    }
    v.publishedBy = pmId;
    v.publishedAt = nowIso();
    notify(d, r.traineeUserId, "Report published", "New progression report", `Your ${r.periodType.toLowerCase()} report (${r.periodStart} → ${r.periodEnd}) was published.`, "/trainee/reports");
  });
}

export function sendReportEmail(reportId: string, recipient: string, subject: string): Result {
  if (!isEmail(recipient)) return fail("Enter a valid recipient email.");
  if (!subject.trim()) return fail("Enter a subject.");
  const email = integration(getDB(), "EMAIL");
  mutate((d) => {
    d.emailDeliveries.unshift({
      id: uid("em"),
      reportId,
      recipient,
      subject: subject.trim(),
      // Provider is not connected in this build: delivery is recorded as failed with retry.
      status: email.status === "Connected" ? "ACCEPTED" : "FAILED",
      attempts: 1,
      createdAt: nowIso(),
    });
  });
  return ok();
}

export function retryEmail(id: string) {
  mutate((d) => {
    const e = d.emailDeliveries.find((x) => x.id === id)!;
    e.attempts += 1;
    e.status = d.integrations.find((i) => i.key === "EMAIL")?.status === "Connected" ? "ACCEPTED" : "FAILED";
  });
}

/* ============================ notifications (M10) ============================ */

/** A retake-request notification stays unread until its request is decided (FR-NOT-02). */
export function awaitsDecision(db: DB, n: { requestId?: string }) {
  return !!n.requestId && db.retakeRequests.some((r) => r.id === n.requestId && r.status === "PENDING");
}

/** Marks one notification read, or every one ("Mark all read") except retake requests still awaiting a decision. */
export function markRead(userId: string, id?: string) {
  mutate((d) => {
    d.notifications.forEach((n) => {
      if (n.recipientId !== userId || n.readAt || hiddenFromBell(d, n)) return;
      if (id ? n.id === id : !awaitsDecision(d, n)) n.readAt = nowIso();
    });
  });
}

/** Ticks or unticks a category: ticked notifications appear in the bell. A retake request cannot be hidden. */
export function setNotificationPref(userId: string, category: string, showInBell: boolean) {
  if (ALWAYS_SHOWN_CATEGORIES.includes(category)) return;
  mutate((d) => {
    const p = d.notificationPrefs.find((x) => x.userId === userId && x.category === category);
    if (p) p.showInBell = showInBell;
    else d.notificationPrefs.push({ userId, category, showInBell });
  });
}

/* ============================ profile (M11) ============================ */

export function updateProfile(userId: string, input: { name: string; bio: string }): Result {
  if (!input.name.trim()) return fail("Display name cannot be empty.");
  mutate((d) => {
    const u = d.users.find((x) => x.id === userId)!;
    u.name = input.name.trim();
    u.bio = input.bio.trim();
  });
  return ok();
}

export function validatePhoto(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) return "Choose a JPG, PNG or WebP image under 2 MB.";
  return null;
}

export function setPhoto(userId: string, dataUrl: string | undefined) {
  mutate((d) => {
    d.users.find((x) => x.id === userId)!.photoUrl = dataUrl;
  });
}

export function setLeaderboardHidden(userId: string, hidden: boolean) {
  mutate((d) => {
    const t = d.trainees.find((x) => x.userId === userId);
    if (t) t.hideFromLeaderboard = hidden;
  });
}

export function approveQuestionSet(pmId: string, setId: string) {
  mutate((d) => {
    const s = d.questionSets.find((x) => x.id === setId)!;
    s.approvedBy = pmId;
    s.source = "APPROVED_POOL";
  });
}

export function updateQuestionSet(setId: string, patch: { durationMin: number; attemptLimit: number }): Result {
  if (patch.durationMin < 1 || patch.attemptLimit < 1) return fail("Duration and attempt limit must be at least 1.");
  mutate((d) => {
    Object.assign(d.questionSets.find((x) => x.id === setId)!, patch);
  });
  return ok();
}

/* ============================ gamification (M12) ============================ */

export function sendKudos(fromId: string, toId: string, category: Kudos["category"], message: string): Result {
  const db = getDB();
  if (fromId === toId) return fail("You cannot send kudos to yourself.");
  if (!message.trim()) return fail("Add a short message.");
  const ws = weekStartOf(todayISO());
  const sentThisWeek = db.kudos.filter((k) => k.fromId === fromId && k.date >= ws);
  if (sentThisWeek.length >= db.xpRules.kudosSendLimitPerWeek) return fail("Weekly limit reached");
  const recent = db.kudos.find((k) => k.fromId === fromId && k.toId === toId && k.date > addDays(todayISO(), -db.xpRules.kudosCooldownDays));
  if (recent) return fail(`You can send kudos to this person again after ${addDays(recent.date, db.xpRules.kudosCooldownDays)}.`);
  const reciprocal = db.kudos.some((k) => k.fromId === toId && k.toId === fromId && k.date >= ws);
  const receivedXp = db.xpEvents.filter((e) => e.traineeUserId === toId && e.source === "Kudos" && e.date >= ws && e.status !== "REJECTED").reduce((s, e) => s + e.amount, 0);
  const capped = receivedXp + db.xpRules.kudos > db.xpRules.kudosReceivedCapPerWeek;
  const t = traineeOf(db, toId);
  mutate((d) => {
    const id = uid("k");
    d.kudos.push({ id, fromId, toId, category, message: message.trim(), date: todayISO(), suspicious: reciprocal });
    addXp(d, {
      traineeUserId: toId,
      source: "Kudos",
      amount: capped ? 0 : d.xpRules.kudos,
      status: reciprocal ? "HELD" : "PENDING",
      key: `kudos:${id}`,
      evidence: `Kudos from ${nameOf(d, fromId)} — ${category}`,
      flag: reciprocal ? "Suspicious exchange" : capped ? "Weekly received cap reached" : undefined,
      date: todayISO(),
    });
    if (reciprocal) {
      d.kudos.filter((k) => k.fromId === toId && k.toId === fromId && k.date >= ws).forEach((k) => (k.suspicious = true));
      if (t) notify(d, t.pmId, "Suspicious kudos", "Suspicious kudos exchange", `${nameOf(d, fromId)} and ${nameOf(d, toId)} sent each other kudos this week.`, "/pm/gamification");
    }
    notify(d, toId, "Kudos received", "You received kudos", `${nameOf(d, fromId)}: ${message.trim()}`, "/trainee/gamification");
  });
  return ok();
}

export function reviewXp(pmId: string, id: string, status: "AWARDED" | "HELD" | "REJECTED" | "REVERSED", reason: string): Result {
  if (!reason.trim()) return fail("A reason is required.");
  const db = getDB();
  const ev = db.xpEvents.find((e) => e.id === id);
  if (!ev) return fail("This XP event no longer exists.");
  if (!inScope(db, pmId, ev.traineeUserId)) return fail("This user is not in your scope.");
  if (ev.status === status) return fail(`This XP is already ${status.toLowerCase()}.`);
  if (status === "REVERSED" && ev.status !== "AWARDED") return fail("Only awarded XP can be reversed.");
  if (status !== "REVERSED" && (ev.status === "REJECTED" || ev.status === "REVERSED")) return fail("This XP was already decided.");
  const before = xpTotal(db, db.xpEvents.find((e) => e.id === id)!.traineeUserId);
  mutate((d) => {
    const e = d.xpEvents.find((x) => x.id === id)!;
    e.status = status;
    e.reason = reason.trim();
    notify(d, e.traineeUserId, "XP decisions", `XP ${status.toLowerCase()}`, `${e.source} (${e.amount} XP): ${reason.trim()}`, "/trainee/gamification");
    const lvBefore = levelFor(d, before).level.name;
    const lvAfter = levelFor(d, xpTotal(d, e.traineeUserId)).level.name;
    if (lvAfter !== lvBefore && status === "AWARDED") notify(d, e.traineeUserId, "Level up", "Level up!", `You reached ${lvAfter}.`, "/trainee/gamification");
  });
  return ok();
}

export function adjustXp(pmId: string, traineeUserId: string, amount: number, reason: string): Result {
  if (!reason.trim()) return fail("A reason is required.");
  if (!inScope(getDB(), pmId, traineeUserId)) return fail("This user is not in your scope.");
  if (!amount) return fail("Enter a non-zero amount.");
  const total = xpTotal(getDB(), traineeUserId);
  if (total + amount < 0) return fail("Adjustment cannot reduce total XP below zero");
  mutate((d) => {
    const key = `manual:${uid("m")}`;
    d.xpEvents.push({ id: uid("xp"), traineeUserId, source: "Manual adjustment", amount, status: "AWARDED", key, evidence: "PM adjustment", reason: reason.trim(), date: todayISO() });
  });
  return ok();
}

export function updateXpRules(pmId: string, rules: XpRules): Result {
  if (Object.entries(rules).some(([k, v]) => k !== "sprintCutoff" && (typeof v !== "number" || v < 0))) return fail("Rule values must be zero or more.");
  if (!/^\d{2}:\d{2}$/.test(rules.sprintCutoff)) return fail("Cutoff must be HH:MM.");
  mutate((d) => {
    d.xpRules = rules;
  });
  return ok();
}

export function updateLevels(pmId: string, levels: Level[]): Result {
  if (!levels.length || levels[0].minXp !== 0) return fail("Thresholds must start at 0.");
  for (let i = 1; i < levels.length; i++) if (levels[i].minXp <= levels[i - 1].minXp) return fail("Thresholds must increase.");
  if (levels.some((l) => !l.name.trim())) return fail("Every level needs a name.");
  mutate((d) => {
    d.levels = levels;
  });
  return ok();
}

export function grantStreakFreeze(pmId: string, traineeUserId: string, date: string, source: "LEAVE" | "HOLIDAY", reason: string): Result {
  if (!date || !reason.trim()) return fail("Date and reason are required.");
  if (!inScope(getDB(), pmId, traineeUserId)) return fail("This user is not in your scope.");
  mutate((d) => {
    d.streakFreezes.push({ traineeUserId, date, source, reason: reason.trim() });
  });
  return ok();
}

export function createQuest(input: { name: string; description: string; target: number; reward: number; start: string; end: string }): Result {
  if (!input.name.trim() || !input.start || !input.end) return fail("Name and dates are required.");
  if (input.end < input.start) return fail("End date cannot precede start date");
  if (input.target < 1) return fail("Target must be at least 1.");
  mutate((d) => {
    d.quests.push({ id: uid("q"), ...input });
  });
  return ok();
}

export function verifyQuestProgress(pmId: string, questId: string, traineeUserId: string, count: number) {
  mutate((d) => {
    const p = d.questProgress.find((x) => x.questId === questId && x.traineeUserId === traineeUserId);
    if (p) Object.assign(p, { count, verifiedBy: pmId });
    else d.questProgress.push({ questId, traineeUserId, count, verifiedBy: pmId });
    const q = d.quests.find((x) => x.id === questId)!;
    if (count >= q.target) addXp(d, { traineeUserId, source: "Quest", amount: q.reward, status: "AWARDED", key: `quest:${questId}:${traineeUserId}`, evidence: `${q.name} completed`, date: todayISO() });
  });
}

/** Awards a badge once. A Technical badge needs a PM-finalised assessment and a PM-reviewed project (FR-ASM-07). */
export function awardBadge(pmId: string, badgeId: string, traineeUserId: string, evidence: string, project?: { reviewed: boolean; url: string }): Result {
  const db = getDB();
  if (!inScope(db, pmId, traineeUserId)) return fail("This user is not in your scope.");
  if (db.badgeAwards.some((b) => b.badgeId === badgeId && b.traineeUserId === traineeUserId)) return fail("This badge is already earned.");
  const badge = db.badges.find((b) => b.id === badgeId);
  if (!badge) return fail("Badge not found.");
  if (!evidence.trim()) return fail("Add the evidence for this badge.");
  let fullEvidence = evidence.trim();
  if (badge.kind === "TECHNICAL") {
    const finalised = db.attempts.some((a) => a.traineeUserId === traineeUserId && a.status === "FINAL");
    if (!finalised) return fail("A Technical badge needs at least one PM-finalised assessment. This user has none yet.");
    if (!project?.url.trim() || !isHttpsUrl(project.url.trim())) return fail("Add an HTTPS link to the project you reviewed.");
    if (!project.reviewed) return fail("Confirm that you have reviewed this user's project.");
    fullEvidence += ` · Project reviewed: ${project.url.trim()}`;
  }
  mutate((d) => {
    d.badgeAwards.push({ badgeId, traineeUserId, evidence: fullEvidence, awardedBy: pmId, awardedAt: todayISO() });
    notify(d, traineeUserId, "Badge", "New badge", `You earned ${badge.name}.`, "/trainee/gamification");
  });
  return ok();
}

export type { Trainee };
