"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/components/layout/hooks";
import { courseById, publishedVersion } from "@/lib/api";
import { EmptyState } from "@/components/ui/ui";
import { TopicView } from "@/components/domain/learning";

export default function PMTopicPreview() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const { db } = useMe();
  const course = courseById(db, courseId);
  if (!course) return <EmptyState title="Course not found" />;
  return <TopicView db={db} course={course} version={publishedVersion(course)} topicId={topicId} basePath={`/pm/courses/${courseId}`} readOnly />;
}
