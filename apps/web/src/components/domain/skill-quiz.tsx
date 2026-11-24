"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff } from "lucide-react";
import type { ProctorRule } from "@/lib/types";
import type { BankQuestion } from "@/lib/content";
import { PROCTOR_RULE_LABEL, SKILL_QUIZ_MAX_VIOLATIONS } from "@/lib/content";
import { Button, Field, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LETTERS = ["a", "b", "c", "d", "e", "f"];

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Timed, proctored skill quiz: one question per page, a numbered question navigator, and rule checks.
 * The parent owns the answers, the violation log and the start time, and decides when the attempt ends.
 */
export function SkillQuiz({
  questions,
  answers,
  onAnswer,
  practical,
  onPractical,
  startedAt,
  minutes,
  markPerQuestion,
  violations,
  onViolation,
  onTimeUp,
  onFinish,
  onLeave,
}: {
  questions: BankQuestion[];
  answers: Record<string, number | null>;
  onAnswer: (questionId: string, value: number | null) => void;
  practical: string;
  onPractical: (v: string) => void;
  startedAt: number;
  minutes: number;
  markPerQuestion: number;
  violations: { rule: ProctorRule; at: string }[];
  onViolation: (rule: ProctorRule) => void;
  onTimeUp: () => void;
  onFinish: () => void;
  onLeave: () => void;
}) {
  // Pages 0..n-1 are the multiple-choice questions; page n is the practical question.
  const total = questions.length;
  const [page, setPage] = useState(0);
  const [hideTime, setHideTime] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const deadline = startedAt + minutes * 60 * 1000;
  const remaining = Math.max(0, Math.round((deadline - now) / 1000));
  const timeUpFired = useRef(false);
  const onViolationRef = useRef(onViolation);
  const onTimeUpRef = useRef(onTimeUp);
  useEffect(() => {
    onViolationRef.current = onViolation;
    onTimeUpRef.current = onTimeUp;
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (remaining > 0 || timeUpFired.current) return;
    timeUpFired.current = true;
    onTimeUpRef.current();
  }, [remaining]);

  // Rule checks while the quiz is on screen.
  useEffect(() => {
    const flag = (rule: ProctorRule) => onViolationRef.current(rule);
    const onVisibility = () => document.visibilityState === "hidden" && flag("TAB_HIDDEN");
    const block = (rule: ProctorRule) => (e: Event) => {
      e.preventDefault();
      flag(rule);
    };
    const onCopy = block("COPY_PASTE");
    const onMenu = block("RIGHT_CLICK");
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onCopy);
    document.addEventListener("contextmenu", onMenu);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onCopy);
      document.removeEventListener("contextmenu", onMenu);
    };
  }, []);

  const q = page < total ? questions[page] : undefined;
  const answeredCount = questions.filter((x) => answers[x.id] != null).length;
  const last = violations[violations.length - 1];
  const strikes = violations.length;
  const lowTime = remaining <= 60;

  const circle = (i: number) => {
    const isPractical = i === total;
    const done = isPractical ? practical.trim().length > 0 : answers[questions[i].id] != null;
    return (
      <button
        key={i}
        type="button"
        onClick={() => setPage(i)}
        aria-label={isPractical ? "Practical question" : `Question ${i + 1}${done ? ", answered" : ", not answered"}${i === page ? ", current" : ""}`}
        aria-current={i === page ? "step" : undefined}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
          i === page ? "border-brand-700 bg-brand-700 text-white ring-2 ring-brand-200" : done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-brand-300",
        )}
      >
        {isPractical ? "P" : i + 1}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-100 select-none">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <span className={cn("rounded border px-3 py-1.5 text-sm tabular-nums", lowTime ? "border-red-400 bg-red-50 text-red-700" : "border-red-200 bg-white text-slate-700")} role="timer" aria-live="off">
              {hideTime ? "Time hidden" : `Time left ${formatClock(remaining)}`}
            </span>
            <Button variant="secondary" size="sm" onClick={() => setHideTime((h) => !h)} aria-label={hideTime ? "Show time" : "Hide time"}>
              {hideTime ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {hideTime ? "Show" : "Hide"}
            </Button>
          </div>
        </div>

        {strikes > 0 && last && (
          <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <strong>
              Warning {Math.min(strikes, SKILL_QUIZ_MAX_VIOLATIONS)} of {SKILL_QUIZ_MAX_VIOLATIONS}:
            </strong>{" "}
            {PROCTOR_RULE_LABEL[last.rule]}. The quiz is submitted automatically at warning {SKILL_QUIZ_MAX_VIOLATIONS}.
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[150px_1fr_220px]">
          <aside className="h-fit rounded-md bg-white p-3 text-xs shadow-sm">
            <p className="rounded-sm bg-brand-700 px-2 py-1 text-white">
              {q ? (
                <>
                  Question <span className="text-base font-semibold">{page + 1}</span>
                </>
              ) : (
                "Practical"
              )}
            </p>
            <p className="mt-2 text-slate-600">{q ? (answers[q.id] != null ? "Answered" : "Not yet answered") : practical.trim() ? "Answered" : "Not yet answered"}</p>
            <p className="mt-1 text-slate-600">{q ? `Marked out of ${markPerQuestion.toFixed(2)}` : "Not scored"}</p>
          </aside>

          <section className="rounded-md bg-white p-6 shadow-sm">
            {q ? (
              <>
                <p className="mb-1 text-xs text-muted">
                  {q.technology} · {q.level}
                </p>
                <p className="text-sm leading-relaxed">{q.text}</p>
                <div className="mt-5 space-y-2.5" role="radiogroup" aria-label={`Question ${page + 1} answers`}>
                  {q.options.map((o, oi) => (
                    <label key={oi} className={cn("flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50", answers[q.id] === oi && "bg-brand-50")}>
                      <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => onAnswer(q.id, oi)} className="mt-1 accent-brand-600" />
                      <span className="w-4 text-slate-500">{LETTERS[oi]}.</span>
                      <span className="font-mono text-[13px]">{o}</span>
                    </label>
                  ))}
                </div>
                <button type="button" onClick={() => onAnswer(q.id, null)} className="mt-3 text-sm text-muted underline-offset-2 hover:text-ink hover:underline">
                  Clear my choice
                </button>
              </>
            ) : (
              <Field label="Practical question" htmlFor="quiz-practical" hint="Free-text answer. It is marked “Pending AI review” and never scored automatically.">
                <p className="mb-2 text-sm">Describe how you would approach a small feature from the first form field to the stored data.</p>
                <Textarea id="quiz-practical" rows={8} value={practical} onChange={(e) => onPractical(e.target.value)} />
              </Field>
            )}
            <div className="mt-8 flex items-center justify-between">
              <Button variant="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                <ArrowLeft className="h-4 w-4" /> Previous page
              </Button>
              {page < total ? (
                <Button onClick={() => setPage((p) => p + 1)}>
                  Next page <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => setConfirmFinish(true)}>Finish attempt</Button>
              )}
            </div>
          </section>

          <nav aria-label="Quiz navigation" className="h-fit rounded-md bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold">Quiz navigation</p>
            <div className="flex flex-wrap gap-2">{Array.from({ length: total + 1 }, (_, i) => circle(i))}</div>
            <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-brand-700" /> Current question
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-emerald-500" /> Answered
              </li>
              <li className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full border border-slate-300 bg-white" /> Not answered
              </li>
            </ul>
            <Button className="mt-4 w-full" variant="secondary" size="sm" onClick={() => setConfirmFinish(true)}>
              Finish attempt…
            </Button>
          </nav>
        </div>
      </div>

      <Dialog
        open={confirmFinish}
        onClose={() => setConfirmFinish(false)}
        title="Finish the attempt?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmFinish(false)}>
              Keep working
            </Button>
            <Button onClick={onFinish}>Submit all and finish</Button>
          </>
        }
      >
        <p className="text-sm">
          You answered {answeredCount} of {total} questions. Unanswered questions score 0. You cannot change your answers after submitting.
        </p>
      </Dialog>

      <Dialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Leave the quiz?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Stay
            </Button>
            <Button onClick={onLeave}>Leave and discard attempt</Button>
          </>
        }
      >
        <p className="text-sm">Going back discards this attempt. Your intake answers are kept, and the timer restarts when you start again.</p>
      </Dialog>
    </div>
  );
}
