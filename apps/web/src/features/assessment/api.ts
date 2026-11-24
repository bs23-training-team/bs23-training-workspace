"use client";

import { type DB, type IntakeAnswers, type ExpertiseEvaluation, type TechResult, type ProctoringRecord, type IntegrityEvent } from "@/lib/mock/types";
import { type BankQuestion, QUESTION_BANK, INTAKE_NO_PROJECTS, INTAKE_DESCRIPTION_MAX, INTAKE_ABILITY } from "@/lib/mock/content";
import { Result, nowIso, notify, ok, fail } from "@/lib/mock/core";
import { getDB, mutate } from "@/lib/mock/store";
import { uid, todayISO } from "@/lib/utils";
import { traineeOf, nameOf, inScope } from "@/lib/mock/selectors";
import { assessmentSettingsError } from "@/features/directory/api";
import { addXp } from "@/features/gamification-core/api";


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

export function attemptPercent(a: { objectiveScore: number; objectiveTotal: number; finalScore?: number }) {
  if (a.finalScore != null) return a.finalScore;
  return a.objectiveTotal ? Math.round((a.objectiveScore / a.objectiveTotal) * 100) : 0;
}

export function assessmentAverage(db: DB, traineeUserId: string) {
  const at = db.attempts.filter((a) => a.traineeUserId === traineeUserId && a.status !== "PENDING_OFFLINE");
  if (!at.length) return null;
  return Math.round(at.reduce((s, a) => s + attemptPercent(a), 0) / at.length);
}

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
