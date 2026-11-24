"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/features/shell";
import { courseById, publishedVersion, LessonView } from "@/features/learning";
import { EmptyState } from "@/components/ui/ui";

export default function PMLessonPreview() {
  const { courseId, topicId, subtopicId } = useParams<{ courseId: string; topicId: string; subtopicId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <LessonView db={db} course={course} version={publishedVersion(course)} topicId={topicId} subtopicId={subtopicId} basePath={`/pm/courses/${courseId}`} readOnly />;
}
