"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Lock, SkipForward, Award } from "lucide-react";
import type { CourseVersion, DB } from "@/lib/mock/types";
import { isSubtopicDone, setTopicState, topicState } from "../mock-api";
import { Badge, Button, ProgressBar } from "@/components/ui/ui";
import { cn } from "@/lib/utils";

const STATE_LABEL = { NOT_STARTED: "Not started", SELF_DONE: "Self-marked done", SKIPPED: "Skipped", MASTERED: "Verified mastery" } as const;

/**
 * Topic graph for one course version (FR-LRN-02). The graph is identical for everyone on a
 * version; personal topic states are shown when `traineeUserId` is set. `readOnly` is the PM preview.
 */
export function CourseRoadmap({ db, version, traineeUserId, basePath, readOnly }: { db: DB; courseId: string; version: CourseVersion; traineeUserId?: string; basePath: string; readOnly?: boolean }) {
  return (
    <ol className="relative space-y-4 border-l-2 border-dashed border-brand-200 pl-6">
      {version.topics.map((t) => {
        const state = traineeUserId ? topicState(db, traineeUserId, t.id) : "NOT_STARTED";
        const done = traineeUserId ? t.subtopics.filter((s) => isSubtopicDone(db, traineeUserId, s.id)).length : 0;
        const pct = Math.round((done / Math.max(1, t.subtopics.length)) * 100);
        const prereqs = t.prerequisites.map((p) => version.topics.find((x) => x.id === p)?.name).filter(Boolean);
        const prereqMet = !traineeUserId || t.prerequisites.every((p) => {
          const pt = version.topics.find((x) => x.id === p);
          return pt && (pt.subtopics.every((s) => isSubtopicDone(db, traineeUserId, s.id)) || ["SELF_DONE", "SKIPPED", "MASTERED"].includes(topicState(db, traineeUserId, p)));
        });
        const Icon = state === "MASTERED" ? Award : state === "SELF_DONE" ? CheckCircle2 : state === "SKIPPED" ? SkipForward : prereqMet ? Circle : Lock;
        return (
          <li key={t.id} className="relative">
            <span className={cn("absolute -left-[37px] top-4 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white", state === "MASTERED" ? "border-emerald-500 text-emerald-600" : "border-brand-300 text-brand-600")}>
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted">Topic {t.order}</p>
                  <Link href={`${basePath}/${t.id}`} className="font-semibold hover:text-brand-700">
                    {t.name}
                  </Link>
                  {prereqs.length > 0 && <p className="mt-0.5 text-xs text-muted">Requires: {prereqs.join(", ")}</p>}
                </div>
                {traineeUserId && <Badge tone={state === "MASTERED" ? "green" : state === "SELF_DONE" ? "blue" : state === "SKIPPED" ? "gray" : "gray"}>{STATE_LABEL[state]}</Badge>}
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {t.subtopics.map((s) => {
                  const d = traineeUserId && isSubtopicDone(db, traineeUserId, s.id);
                  return (
                    <li key={s.id}>
                      <Link href={`${basePath}/${t.id}/${s.id}`} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs", d ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line hover:bg-slate-50")}>
                        {d && <CheckCircle2 className="h-3 w-3" aria-hidden />}
                        {s.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {traineeUserId && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <div className="w-40 text-xs text-muted">
                    Content {pct}%
                    <ProgressBar value={pct} label={`${t.name} content`} />
                  </div>
                  {!readOnly && state !== "MASTERED" && (
                    <div className="flex gap-2">
                      {state !== "SELF_DONE" && (
                        <Button size="sm" variant="secondary" onClick={() => setTopicState(traineeUserId, t.id, "SELF_DONE")}>
                          Self-mark done
                        </Button>
                      )}
                      {state !== "SKIPPED" && (
                        <Button size="sm" variant="ghost" onClick={() => setTopicState(traineeUserId, t.id, "SKIPPED")}>
                          Skip
                        </Button>
                      )}
                      {state !== "NOT_STARTED" && (
                        <Button size="sm" variant="ghost" onClick={() => setTopicState(traineeUserId, t.id, "NOT_STARTED")}>
                          Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
