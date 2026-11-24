"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, Lock, PlayCircle, Video } from "lucide-react";
import type { Course, CourseVersion, DB } from "@/lib/mock/types";
import { attemptPercent, attemptsFor } from "@/features/assessment";
import { completeSubtopic, isSubtopicDone, topicState } from "../mock-api";
import { integration } from "@/lib/mock/selectors";
import { CourseRoadmap } from "./course-roadmap";
import { Alert, Badge, Button, Card, EmptyState, IntegrationStatus, ProgressBar, StatusBadge } from "@/components/ui/ui";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
      <ArrowLeft className="h-4 w-4" aria-hidden /> {label}
    </Link>
  );
}

/** Assessments for a course with unlock rules (FR-LRN-04, FR-ASM-01). */
export function CourseAssessments({ db, course, version, traineeUserId, readOnly }: { db: DB; course: Course; version: CourseVersion; traineeUserId?: string; readOnly?: boolean }) {
  const sets = db.questionSets.filter((s) => s.courseId === course.id);
  return (
    <Card title="Assessments" description={`Pinned to content v${version.version} and rubric v1.0`}>
      {sets.length === 0 ? (
        <p className="text-sm text-muted">No approved question sets for this course yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sets.map((s) => {
            const topic = version.topics.find((t) => t.id === s.topicId);
            const required = topic ? topic.subtopics : version.topics.flatMap((t) => t.subtopics);
            const unlocked = !traineeUserId || required.every((x) => isSubtopicDone(db, traineeUserId, x.id));
            const attempts = traineeUserId ? attemptsFor(db, traineeUserId, s.id) : [];
            const last = attempts[attempts.length - 1];
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-xs text-muted">
                    {s.type === "COURSE_FINAL" ? "Course final" : s.type === "FULL_TOPIC" ? "Full-topic" : "Subtopic"} · {s.durationMin} min · {attempts.length}/{s.attemptLimit} attempts used
                    {!s.approvedBy && " · awaiting PM approval"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {last && (
                    <>
                      <span className="text-sm font-medium">{attemptPercent(last)}%</span>
                      <StatusBadge status={last.status === "FINAL" ? "Final" : last.status === "PENDING_OFFLINE" ? "Pending (offline)" : "Provisional"} />
                    </>
                  )}
                  {readOnly ? (
                    <Badge tone="gray">User-only</Badge>
                  ) : !unlocked ? (
                    <Badge tone="gray">
                      <Lock className="h-3 w-3" /> Complete {topic ? "all lessons in this topic" : "every lesson"} first
                    </Badge>
                  ) : !s.approvedBy ? null : attempts.length >= s.attemptLimit ? (
                    <Link href={`/trainee/assessments/${s.id}`} className="text-sm font-medium text-brand-600">
                      View results
                    </Link>
                  ) : (
                    <Link href={`/trainee/assessments/${s.id}`} className="inline-flex h-8 items-center rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
                      {attempts.length ? "Retry" : "Start"}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function CourseView({ db, course, version, traineeUserId, basePath, backHref, readOnly }: { db: DB; course: Course; version: CourseVersion; traineeUserId?: string; basePath: string; backHref: string; readOnly?: boolean }) {
  const subs = version.topics.flatMap((t) => t.subtopics);
  const done = traineeUserId ? subs.filter((s) => isSubtopicDone(db, traineeUserId, s.id)).length : 0;
  const mastered = traineeUserId ? version.topics.filter((t) => topicState(db, traineeUserId, t.id) === "MASTERED").length : 0;
  const content = Math.round((done / Math.max(1, subs.length)) * 100);
  const mastery = Math.round((mastered / Math.max(1, version.topics.length)) * 100);
  return (
    <div>
      <BackLink href={backHref} label="Back" />
      {readOnly && (
        <div className="mb-4">
          <Alert tone="amber" title="Read-only preview">
            PMs can preview any curriculum. Exams, video completion and progress are user-only.
          </Alert>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">{course.title}</h1>
            <Badge tone="blue">{course.track}</Badge>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">{course.description}</p>
          <p className="mt-1 text-xs text-muted">
            Curriculum version {version.version} · {version.status.toLowerCase()} · source {course.source === "ROADMAP_API" ? "Roadmap API (sample)" : "PM-added"}
          </p>
        </div>
        {traineeUserId && (
          <div className="grid w-full max-w-sm grid-cols-2 gap-4 text-xs text-muted">
            <div>
              Content completion {content}%
              <ProgressBar value={content} label="Content completion" />
            </div>
            <div>
              Verified mastery {mastery}%
              <ProgressBar value={mastery} tone="green" label="Verified mastery" />
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CourseRoadmap db={db} courseId={course.id} version={version} traineeUserId={traineeUserId} basePath={basePath} readOnly={readOnly} />
        </div>
        <div className="space-y-6">
          <CourseAssessments db={db} course={course} version={version} traineeUserId={traineeUserId} readOnly={readOnly} />
          <Alert tone="blue">Self-marked done and skipped topics never count as verified mastery or XP. A topic is mastered only when your PM marks it mastered while finalising an assessment.</Alert>
        </div>
      </div>
    </div>
  );
}

export function TopicView({ db, course, version, topicId, traineeUserId, basePath, readOnly }: { db: DB; course: Course; version: CourseVersion; topicId: string; traineeUserId?: string; basePath: string; readOnly?: boolean }) {
  const t = version.topics.find((x) => x.id === topicId);
  if (!t) return <EmptyState title="Topic not found" />;
  const done = traineeUserId ? t.subtopics.filter((s) => isSubtopicDone(db, traineeUserId, s.id)).length : 0;
  const pct = Math.round((done / Math.max(1, t.subtopics.length)) * 100);
  const set = db.questionSets.find((s) => s.topicId === t.id);
  const unlocked = done === t.subtopics.length;
  return (
    <div>
      <BackLink href={basePath} label={course.title} />
      <h1 className="text-2xl font-semibold">{t.name}</h1>
      <p className="mt-1 text-sm text-muted">Topic {t.order} · version {version.version}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Learning outcomes">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {t.outcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </Card>
          <Card title="Subtopics">
            <ul className="divide-y divide-line">
              {t.subtopics.map((s) => {
                const d = traineeUserId && isSubtopicDone(db, traineeUserId, s.id);
                return (
                  <li key={s.id} className="flex items-center justify-between py-3">
                    <Link href={`${basePath}/${t.id}/${s.id}`} className="flex items-center gap-2 font-medium hover:text-brand-700">
                      {d ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Completed" /> : <PlayCircle className="h-4 w-4 text-muted" aria-hidden />}
                      {s.name}
                    </Link>
                    <span className="text-xs text-muted">{d ? "Completed" : "Not completed"}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Prerequisites">
            {t.prerequisites.length ? (
              <ul className="space-y-1 text-sm">
                {t.prerequisites.map((p) => (
                  <li key={p}>{version.topics.find((x) => x.id === p)?.name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">None</p>
            )}
          </Card>
          {traineeUserId && (
            <Card title="Progress">
              <p className="mb-2 text-sm">
                {done}/{t.subtopics.length} lessons · {pct}%
              </p>
              <ProgressBar value={pct} label="Topic progress" />
            </Card>
          )}
          <Card title="Full-topic assessment">
            {!set ? (
              <p className="text-sm text-muted">No assessment for this topic yet.</p>
            ) : readOnly ? (
              <p className="text-sm text-muted">{set.title} · User-only</p>
            ) : unlocked ? (
              <Link href={`/trainee/assessments/${set.id}`} className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white">
                Open {set.title}
              </Link>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Lock className="h-4 w-4" aria-hidden /> Unlocks after you complete every lesson in this topic.
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function LessonView({ db, course, version, topicId, subtopicId, traineeUserId, basePath, readOnly }: { db: DB; course: Course; version: CourseVersion; topicId: string; subtopicId: string; traineeUserId?: string; basePath: string; readOnly?: boolean }) {
  const t = version.topics.find((x) => x.id === topicId);
  const s = t?.subtopics.find((x) => x.id === subtopicId);
  if (!t || !s) return <EmptyState title="Lesson not found" />;
  const done = traineeUserId && isSubtopicDone(db, traineeUserId, s.id);
  const yt = integration(db, "YOUTUBE");
  const idx = t.subtopics.findIndex((x) => x.id === s.id);
  const next = t.subtopics[idx + 1];
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink href={`${basePath}/${t.id}`} label={t.name} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{s.name}</h1>
          <p className="mt-1 text-xs text-muted">
            {course.title} · reviewed content v{version.version}
          </p>
        </div>
        {done && <Badge tone="green">Completed</Badge>}
      </div>
      <div className="mt-6 space-y-5">
        <Card title="Theory & definition">
          <p className="text-sm leading-relaxed">{s.theory}</p>
        </Card>
        <Card title="Worked example">
          <p className="text-sm leading-relaxed">{s.example}</p>
        </Card>
        <Card title="Pseudocode">
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-[13px] text-slate-100">{s.pseudocode}</pre>
        </Card>
        <Card title="Recommended tutorials" description="Video recommendations are versioned separately from the reviewed lesson content.">
          <IntegrationStatus name="YouTube" status={yt.status} lastSync={yt.lastSync} />
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Video className="h-4 w-4" aria-hidden /> Video recommendations are unavailable while the service is disconnected. The lesson content above stays available.
          </p>
          {s.resources.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {s.resources.map((r) => (
                <li key={r}>
                  <a href={r} target="_blank" rel="noreferrer" className="text-brand-600 underline">
                    {r}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {!readOnly && traineeUserId && (
          <div className="flex flex-wrap justify-end gap-2">
            {!done && <Button onClick={() => completeSubtopic(traineeUserId, s.id)}>Mark lesson complete</Button>}
            {next && (
              <Link href={`${basePath}/${t.id}/${next.id}`} className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-4 text-sm font-medium">
                Next lesson
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
