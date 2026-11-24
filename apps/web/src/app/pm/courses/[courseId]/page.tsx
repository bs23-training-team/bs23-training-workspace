"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/components/layout/hooks";
import { courseById, publishedVersion } from "@/lib/api";
import { EmptyState } from "@/components/ui/ui";
import { CourseView } from "@/components/domain/learning";

/** PM read-only curriculum preview (FR-LRN-07). */
export default function PMCoursePreview() {
  const { courseId } = useParams<{ courseId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <CourseView db={db} course={course} version={publishedVersion(course)} basePath={`/pm/courses/${courseId}`} backHref="/pm/courses" readOnly />;
}
