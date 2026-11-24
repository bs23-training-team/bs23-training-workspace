"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, ShieldAlert, WifiOff } from "lucide-react";
import { useMe } from "@/features/shell";
import { appealAttempt, attemptPercent, attemptsFor, submitAttempt } from "../mock-api";
import { assignmentsOf, courseById, BackLink } from "@/features/learning";
import type { IntegrityEvent, Question } from "@/lib/mock/types";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, StatusBadge, Table, Td, Textarea } from "@/components/ui/ui";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, formatDateTime } from "@/lib/utils";

type Phase = "intro" | "attempt" | "result";
const REASON_LABEL = { SUBMITTED: "Submitted", TIME_UP: "Time up — auto-submitted", TAB_HIDDEN: "Tab hidden — auto-submitted", OFFLINE: "Offline — pending" } as const;

export default function AssessmentPage() {
  const { setId } = useParams<{ setId: string }>();
  const { db, user } = useMe();
  const toast = useToast();
  const set = db.questionSets.find((s) => s.id === setId);
  const course = set && courseById(db, set.courseId);
  const assigned = set && assignmentsOf(db, user.id).some((a) => a.courseId === set.courseId);
  const attempts = set ? attemptsFor(db, user.id, set.id) : [];

  const [phase, setPhase] = useState<Phase>("intro");
  const [ack, setAck] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remaining, setRemaining] = useState(0);
  const [savedAt, setSavedAt] = useState<string>("");
  const [offline, setOffline] = useState(false);
  const [lastAttemptId, setLastAttemptId] = useState<string>("");
  const [appealFor, setAppealFor] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const [appealError, setAppealError] = useState("");

  const answersRef = useRef(answers);
  const eventsRef = useRef<IntegrityEvent[]>([]);
  const startedRef = useRef("");
  const submittedRef = useRef(false);
  const draftKey = `bs23-attempt-draft-${user.id}-${setId}`;

  const finish = useCallback(
    (reason: "SUBMITTED" | "TIME_UP" | "TAB_HIDDEN") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      const r = submitAttempt(user.id, setId, answersRef.current, reason, eventsRef.current, startedRef.current);
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      if (r.ok) {
        setLastAttemptId(r.data!);
        setPhase("result");
        if (reason !== "SUBMITTED") toast(REASON_LABEL[reason], "info");
      } else toast(r.error, "error");
    },
    [user.id, setId, draftKey, toast],
  );

  // timer
  useEffect(() => {
    if (phase !== "attempt") return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setTimeout(() => finish("TIME_UP"), 0);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, finish]);

  // integrity rules (FR-ASM-04)
  useEffect(() => {
    if (phase !== "attempt") return;
    const log = (type: IntegrityEvent["type"]) => eventsRef.current.push({ type, at: new Date().toISOString() });
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        log("TAB_HIDDEN");
        finish("TAB_HIDDEN");
      }
    };
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      log("CONTEXT_MENU_BLOCKED");
    };
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      log("COPY_BLOCKED");
    };
    const onOffline = () => {
      log("OFFLINE");
      setOffline(true);
    };
    const onOnline = () => setOffline(false);
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("copy", onCopy);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("contextmenu", onCtx);
      document.removeEventListener("copy", onCopy);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [phase, finish]);

  if (!set || !course) return <EmptyState title="Assessment not found" />;
  if (!assigned) return <EmptyState title="This assessment belongs to a course that is not assigned to you" />;

  const start = () => {
    const pool = [...set.questions];
    let draft: Record<string, string> = {};
    try {
      draft = JSON.parse(localStorage.getItem(draftKey) ?? "{}");
    } catch {}
    setQuestions(pool);
    setAnswers(draft);
    answersRef.current = draft;
    eventsRef.current = [];
    startedRef.current = new Date().toISOString();
    submittedRef.current = false;
    setRemaining(set.durationMin * 60);
    setPhase("attempt");
  };

  const answer = (qid: string, v: string) => {
    const next = { ...answersRef.current, [qid]: v };
    answersRef.current = next;
    setAnswers(next);
    try {
      localStorage.setItem(draftKey, JSON.stringify(next)); // stands in for server autosave
    } catch {}
    setSavedAt(new Date().toLocaleTimeString("en-GB"));
  };

  const sendAppeal = () => {
    const r = appealAttempt(user.id, appealFor!, appealReason);
    if (!r.ok) return setAppealError(r.error);
    setAppealFor(null);
    setAppealReason("");
    toast("Review request sent. Your original result is kept.");
  };

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const last = db.attempts.find((a) => a.id === lastAttemptId);

  return (
    <div className="mx-auto max-w-3xl">
      {phase !== "attempt" && <BackLink href={`/trainee/roadmap/${course.id}`} label={course.title} />}
      <h1 className="text-2xl font-semibold">{set.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {set.questions.length} questions · {set.durationMin} minutes · attempt limit {set.attemptLimit} · content v{set.contentVersion} · rubric v{set.rubricVersion}
      </p>

      {phase === "intro" && (
        <div className="mt-6 space-y-5">
          <Card title="Instructions">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>The attempt is timed. Answers save automatically as you go.</li>
              <li>Switching tab, minimising or locking the screen auto-submits your saved answers.</li>
              <li>Copying question text and the right-click menu are blocked. Integrity events are logged for PM review — they are review signals, not proof.</li>
              <li>Objective questions are scored instantly. Short answers are scored by rubric ({set.rubric}) with AI assistance and PM approval.</li>
              <li>Your result is Provisional until your PM reviews it.</li>
              <li>If the connection drops, your submission stays pending until it returns. You may request a review of any interruption.</li>
            </ul>
          </Card>
          <Card title="Assessment & privacy policy">
            <p className="text-sm text-muted">Your answers, timings and integrity events are stored for your PM&apos;s review.</p>
            <div className="mt-4">
              <Checkbox checked={ack} onChange={setAck} label="I have read and accept the assessment and privacy policy." />
            </div>
          </Card>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">
              {attempts.length}/{set.attemptLimit} attempts used
            </span>
            <Button disabled={!ack || attempts.length >= set.attemptLimit || !set.approvedBy} onClick={start}>
              {attempts.length >= set.attemptLimit ? "No attempts left" : "Start attempt"}
            </Button>
          </div>
        </div>
      )}

      {phase === "attempt" && (
        <div className="mt-4 select-none">
          <div className="sticky top-16 z-20 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 shadow-sm">
            <span className={cn("flex items-center gap-2 font-mono text-lg font-semibold", remaining < 60 && "text-red-600")} role="timer" aria-live="off">
              <Clock className="h-5 w-5" aria-hidden /> {mm}:{ss}
            </span>
            <span className="text-xs text-muted" role="status">
              {savedAt ? `Saved ${savedAt}` : "Answers save automatically"}
            </span>
            <Button onClick={() => finish("SUBMITTED")}>Submit</Button>
          </div>
          {offline && (
            <div className="mb-4">
              <Alert tone="amber" title="You are offline">
                <span className="flex items-center gap-2">
                  <WifiOff className="h-4 w-4" /> Keep answering. Your submission will stay pending until the connection returns.
                </span>
              </Alert>
            </div>
          )}
          <div className="space-y-4">
            {questions.map((q, i) => (
              <Card key={q.id} title={`Q${i + 1}. ${q.text}`} description={q.type === "MCQ" ? "Choose one" : "Short answer — rubric scored, pending PM review"}>
                {q.type === "MCQ" ? (
                  <div className="space-y-2">
                    {q.options!.map((o, oi) => (
                      <label key={oi} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", answers[q.id] === String(oi) ? "border-brand-500 bg-brand-50" : "border-line")}>
                        <input type="radio" name={q.id} checked={answers[q.id] === String(oi)} onChange={() => answer(q.id, String(oi))} className="accent-brand-600" />
                        <span className="font-mono text-[13px]">{o}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <Textarea aria-label={`Answer to question ${i + 1}`} rows={5} value={answers[q.id] ?? ""} onChange={(e) => answer(q.id, e.target.value)} />
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {phase === "result" && last && (
        <div className="mt-6 space-y-5">
          <Card title="Your result" action={<StatusBadge status={last.status === "PENDING_OFFLINE" ? "Pending (offline)" : "Provisional"} />}>
            <p className="text-4xl font-semibold">{attemptPercent(last)}%</p>
            <p className="mt-1 text-sm text-muted">
              Objective {last.objectiveScore}/{last.objectiveTotal} · {REASON_LABEL[last.submitReason]} · provisional
            </p>
            {last.integrityEvents.length > 0 && (
              <p className="mt-3 flex items-center gap-2 text-sm text-amber-800">
                <ShieldAlert className="h-4 w-4" /> {last.integrityEvents.length} integrity event(s) logged for PM review.
              </p>
            )}
          </Card>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAppealFor(last.id)}>
              Request review
            </Button>
            <Link href={`/trainee/roadmap/${course.id}`} className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">
              Back to roadmap
            </Link>
          </div>
        </div>
      )}

      {phase !== "attempt" && attempts.length > 0 && (
        <Card className="mt-6" title="Attempt history" description="Original results are preserved and never silently replaced.">
          <Table head={["#", "Submitted", "Reason", "Score", "Status", ""]}>
            {attempts.map((a) => {
              const appeal = db.appeals.find((x) => x.attemptId === a.id);
              return (
                <tr key={a.id}>
                  <Td>{a.attemptNo}</Td>
                  <Td>{formatDateTime(a.submittedAt)}</Td>
                  <Td>{REASON_LABEL[a.submitReason]}</Td>
                  <Td>
                    {attemptPercent(a)}%{a.finalScore != null && <span className="text-xs text-muted"> (objective {a.objectiveScore}/{a.objectiveTotal})</span>}
                  </Td>
                  <Td>
                    <StatusBadge status={a.status === "FINAL" ? "Final" : a.status === "PENDING_OFFLINE" ? "Pending (offline)" : "Provisional"} />
                  </Td>
                  <Td>
                    {appeal ? (
                      <Badge tone={appeal.status === "OPEN" ? "amber" : "green"}>Review {appeal.status.toLowerCase()}</Badge>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setAppealFor(a.id)}>
                        Request review
                      </Button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Dialog
        open={!!appealFor}
        onClose={() => setAppealFor(null)}
        title="Request a review or appeal"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAppealFor(null)}>
              Cancel
            </Button>
            <Button onClick={sendAppeal}>Send request</Button>
          </>
        }
      >
        <p className="text-sm text-muted">Your original result stays on record. The PM reviews the attempt and any integrity events.</p>
        <Field label="Reason" htmlFor="ar" required error={appealError}>
          <Textarea id="ar" value={appealReason} onChange={(e) => setAppealReason(e.target.value)} placeholder="e.g. My laptop locked the screen automatically during the attempt." />
        </Field>
      </Dialog>
    </div>
  );
}
