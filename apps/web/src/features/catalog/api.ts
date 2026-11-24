"use client";

import { type DB, type Assignment } from "@/lib/mock/types";
import { latestEvaluation } from "@/features/assessment/api";
import { assignmentsOf, courseById, publishedVersion } from "@/features/learning/api";
import { mutate, getDB } from "@/lib/mock/store";
import { todayISO, uid, isHttpsUrl } from "@/lib/utils";
import { Result, fail, notify, ok } from "@/lib/mock/core";
import { pmTrainees, traineeOf, nameOf, inScope } from "@/lib/mock/selectors";


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
