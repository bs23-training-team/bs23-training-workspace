"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/components/layout/hooks";
import { courseById, publishedVersion } from "@/lib/api";
import { EmptyState } from "@/components/ui/ui";
import { LessonView } from "@/components/domain/learning";

export default function PMLessonPreview() {
  const { courseId, topicId, subtopicId } = useParams<{ courseId: string; topicId: string; subtopicId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <LessonView db={db} course={course} version={publishedVersion(course)} topicId={topicId} subtopicId={subtopicId} basePath={`/pm/courses/${courseId}`} readOnly />;
}
