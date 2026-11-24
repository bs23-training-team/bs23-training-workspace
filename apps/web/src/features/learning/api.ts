"use client";

import { type DB, type Course, type Assignment, type TopicStateValue } from "@/lib/mock/types";
import { mutate } from "@/lib/mock/store";
import { todayISO } from "@/lib/utils";


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
