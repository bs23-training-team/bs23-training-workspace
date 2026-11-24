"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/features/shell";
import { courseById, publishedVersion, CourseView } from "@/features/learning";
import { EmptyState } from "@/components/ui/ui";

/** PM read-only curriculum preview (FR-LRN-07). */
export default function PMCoursePreview() {
  const { courseId } = useParams<{ courseId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <CourseView db={db} course={course} version={publishedVersion(course)} basePath={`/pm/courses/${courseId}`} backHref="/pm/courses" readOnly />;
}
