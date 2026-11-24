"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useMe, useUnsavedWarning } from "@/features/shell";
import { emptyIntake, hasApprovedRetake, intakeToProfile, latestEvaluation, questionsFor, submitEvaluation, validateIntake } from "../api";
import { traineeOf } from "@/lib/mock/selectors";
import { SKILL_QUIZ_DEFAULT_MINUTES, SKILL_QUIZ_MAX_VIOLATIONS } from "@/lib/mock/content";
import type { ExpertiseEvaluation, IntakeAnswers, ProctorRule, ProctoringRecord } from "@/lib/mock/types";
import { SkillReport } from "../components/skill-report";
import { IntakeForm } from "../components/intake-form";
import { SkillQuiz } from "../components/skill-quiz";
import { Button, Card } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const STEPS = ["About you", "Skills assessment", "Skill analysis"];

type Violation = { rule: ProctorRule; at: string };
interface SavedAttempt {
  intake: IntakeAnswers;
  startedAt: number;
  answers: Record<string, number | null>;
  practical: string;
  violations: Violation[];
}

function readSaved(key: string): SavedAttempt | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SavedAttempt) : null;
  } catch {
    return null;
  }
}

function exitFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

export default function OnboardingPage() {
  const { db, user } = useMe();
  const toast = useToast();
  const storageKey = `bs23-skill-attempt:${user.id}`;
  const router = useRouter();
  const [isRetest] = useState(() => !!latestEvaluation(db, user.id));
  // A retake needs the PM's approval (resuming an attempt already in progress is still allowed).
  const [blocked] = useState(() => !!latestEvaluation(db, user.id) && !hasApprovedRetake(db, user.id) && !readSaved(storageKey));
  useEffect(() => {
    if (blocked) router.replace("/trainee/skill-analysis");
  }, [blocked, router]);
  // An attempt in progress survives a reload: the timer keeps running and the reload is logged as a rule breach.
  const [saved] = useState(() => readSaved(storageKey));
  const [step, setStep] = useState(saved ? 1 : 0);
  const [intake, setIntake] = useState<IntakeAnswers>(saved?.intake ?? emptyIntake());
  const [startedAt, setStartedAt] = useState<number | null>(saved?.startedAt ?? null);
  const [answers, setAnswers] = useState<Record<string, number | null>>(saved?.answers ?? {});
  const [practical, setPractical] = useState(saved?.practical ?? "");
  const [violations, setViolations] = useState<Violation[]>(saved ? [...saved.violations, { rule: "PAGE_RELOAD", at: new Date().toISOString() }] : []);
  const [showRules, setShowRules] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ExpertiseEvaluation | null>(null);
  const profile = useMemo(() => intakeToProfile(intake), [intake]);
  const questions = useMemo(() => questionsFor(profile.technologies, profile.experience), [profile.technologies, profile.experience]);
  // Time and total marks come from what the PM entered when adding this user (policy time is the fallback).
  const me = traineeOf(db, user.id);
  const minutes = me?.skillAssessmentMinutes ?? SKILL_QUIZ_DEFAULT_MINUTES;
  const totalMarks = me?.skillAssessmentMarks ?? questions.length;
  const markPerQuestion = questions.length ? Math.round((totalMarks / questions.length) * 100) / 100 : 0;
  const finished = useRef(false);
  const latest = useRef({ intake, profile, answers, practical, violations, startedAt, minutes, totalMarks });
  useEffect(() => {
    latest.current = { intake, profile, answers, practical, violations, startedAt, minutes, totalMarks };
  });
  useUnsavedWarning(step === 1);

  useEffect(() => {
    if (step !== 1 || startedAt == null) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ intake, startedAt, answers, practical, violations } satisfies SavedAttempt));
    } catch {
      /* storage unavailable: the attempt just cannot be resumed */
    }
  }, [step, startedAt, intake, answers, practical, violations, storageKey]);

  const clearSaved = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };

  const finish = useCallback(
    (endReason: ProctoringRecord["endReason"]) => {
      const s = latest.current;
      if (finished.current || s.startedAt == null) return;
      finished.current = true;
      const proctoring: ProctoringRecord = { durationMin: s.minutes, timeTakenSec: Math.min(s.minutes * 60, Math.round((Date.now() - s.startedAt) / 1000)), endReason, totalMarks: s.totalMarks, violations: s.violations };
      const r = submitEvaluation(user.id, s.profile, s.answers, s.practical, s.intake, proctoring);
      clearSaved();
      exitFullscreen();
      if (r.ok && r.data) {
        setResult(r.data);
        setStep(2);
        toast(endReason === "TIME_UP" ? "Time is up. Your attempt was submitted." : endReason === "VIOLATIONS" ? "Your attempt was submitted after repeated rule breaches." : "Skill analysis saved. Your PM has been notified.");
        window.scrollTo(0, 0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, toast],
  );

  const addViolation = useCallback((rule: ProctorRule) => {
    setViolations((v) => [...v, { rule, at: new Date().toISOString() }]);
  }, []);

  useEffect(() => {
    if (step === 1 && violations.length >= SKILL_QUIZ_MAX_VIOLATIONS) finish("VIOLATIONS");
  }, [step, violations.length, finish]);

  const next1 = () => {
    const problem = validateIntake(intake);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setShowRules(true);
  };

  const start = () => {
    setShowRules(false);
    setAnswers({});
    setPractical("");
    setViolations([]);
    finished.current = false;
    setStartedAt(Date.now());
    setStep(1);
    window.scrollTo(0, 0);
  };

  const leaveQuiz = () => {
    clearSaved();
    exitFullscreen();
    setStartedAt(null);
    setAnswers({});
    setPractical("");
    setViolations([]);
    setStep(0);
  };

  if (blocked) return null;
  if (step === 1 && startedAt != null) {
    return (
      <SkillQuiz
        questions={questions}
        answers={answers}
        onAnswer={(id, v) => setAnswers((a) => ({ ...a, [id]: v }))}
        practical={practical}
        onPractical={setPractical}
        startedAt={startedAt}
        minutes={minutes}
        markPerQuestion={markPerQuestion}
        violations={violations}
        onViolation={addViolation}
        onTimeUp={() => finish("TIME_UP")}
        onFinish={() => finish("SUBMITTED")}
        onLeave={leaveQuiz}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">{isRetest ? "Retake skill assessment" : "Initial skill assessment"}</h1>
      <p className="mt-1 text-sm text-muted">
        {isRetest ? "Your earlier reports stay in your history and your current courses stay unchanged." : "Complete these steps before using the workspace. It helps your PM plan your learning."}
      </p>

      <ol className="my-6 grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", i < step ? "bg-emerald-500 text-white" : i === step ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600")}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={cn("text-sm", i === step ? "font-semibold" : "text-muted")}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card title="Step 1 — About you" description="Answer all ten questions. Questions 5–7 repeat for each skill you pick in question 4.">
          <div className="space-y-6">
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <IntakeForm value={intake} onChange={setIntake} />
            <div className="flex justify-end">
              <Button onClick={next1}>Continue to skills assessment</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && result && (
        <div className="space-y-5">
          <SkillReport db={db} ev={result} />
          <div className="flex justify-end">
            <Link href="/trainee/dashboard" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
              Go to my dashboard
            </Link>
          </div>
        </div>
      )}

      <Dialog
        open={showRules}
        onClose={() => setShowRules(false)}
        title="Before you start: assessment rules"
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRules(false)}>
              Back
            </Button>
            <Button onClick={start}>Start assessment</Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-semibold">Time</h3>
            <p>
              You have <strong>{minutes} minutes</strong>. The timer starts when you press Start assessment, and the attempt is submitted automatically when time ends.
            </p>
          </section>
          <section>
            <h3 className="font-semibold">Marks</h3>
            <p>
              {questions.length} multiple-choice question{questions.length === 1 ? "" : "s"}, <strong>{markPerQuestion} mark{markPerQuestion === 1 ? "" : "s"} each</strong>, <strong>{totalMarks} marks in total</strong>. There is no negative marking. A short practical question at the end is not scored.
            </p>
          </section>
          <section>
            <h3 className="font-semibold">Question pattern</h3>
            <p>One question per page with one correct answer. Move with Next and Previous or with the numbered buttons, and change answers any time before you finish. You may leave a question unanswered. Questions are personalised to your skills and experience.</p>
          </section>
          <section>
            <h3 className="font-semibold">Proctoring rules</h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Stay on this tab and keep the window in front.</li>
              <li>Do not open other tabs or windows.</li>
              <li>Copy, cut, paste and the right-click menu are blocked.</li>
              <li>Each breach is a warning. At warning {SKILL_QUIZ_MAX_VIOLATIONS} the quiz is submitted automatically.</li>
              <li>Reloading the page counts as a breach and the timer keeps running.</li>
              <li>Every breach is listed in your report, which your PM can see.</li>
            </ul>
          </section>
          <p className="font-medium">Good luck!</p>
        </div>
      </Dialog>
    </div>
  );
}
