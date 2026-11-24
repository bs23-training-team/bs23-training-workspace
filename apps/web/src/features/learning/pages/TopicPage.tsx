"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/features/shell";
import { assignmentsOf, courseById, versionForAssignment } from "../mock-api";
import { TopicView } from "../components/learning";
import { EmptyState } from "@/components/ui/ui";

export default function TraineeTopicPage() {
  const { courseId, topicId } = useParams<{ courseId: string; topicId: string }>();
  const { db, user } = useMe();
  const a = assignmentsOf(db, user.id).find((x) => x.courseId === courseId);
  const course = courseById(db, courseId);
  const version = a && versionForAssignment(db, a);
  if (!a || !course || !version) return <EmptyState title="This course is not assigned to you" />;
  return <TopicView db={db} course={course} version={version} topicId={topicId} traineeUserId={user.id} basePath={`/trainee/roadmap/${courseId}`} />;
}
