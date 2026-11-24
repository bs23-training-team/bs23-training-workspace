"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/features/shell";
import { courseById, publishedVersion, TopicView } from "@/features/learning";
import { EmptyState } from "@/components/ui/ui";

export default function PMTopicPreview() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <TopicView db={db} course={course} version={publishedVersion(course)} topicId={topicId} basePath={`/pm/courses/${courseId}`} readOnly />;
}
