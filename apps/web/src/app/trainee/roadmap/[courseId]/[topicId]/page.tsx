"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/components/layout/hooks";
import { assignmentsOf, courseById, versionForAssignment } from "@/lib/api";
import { EmptyState } from "@/components/ui/ui";
import { TopicView } from "@/components/domain/learning";

export default function TraineeTopicPage() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const { db, user } = useMe();
  const a = assignmentsOf(db, user.id).find((x) => x.courseId === courseId);
  const course = courseById(db, courseId);
  const version = a && versionForAssignment(db, a);
  if (!a || !course || !version) return <EmptyState title="This course is not assigned to you" />;
  return <TopicView db={db} course={course} version={version} topicId={topicId} traineeUserId={user.id} basePath={`/trainee/roadmap/${courseId}`} />;
}
