"use client";

import { useParams } from "next/navigation";
import { useMe } from "@/components/layout/hooks";
import { assignmentsOf, courseById, versionForAssignment } from "@/lib/api";
import { EmptyState } from "@/components/ui/ui";
import { CourseView } from "@/components/domain/learning";

export default function TraineeCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { db, user } = useMe();
  const a = assignmentsOf(db, user.id).find((x) => x.courseId === courseId);
  const course = courseById(db, courseId);
  const version = a && versionForAssignment(db, a);
  if (!a || !course || !version) return <EmptyState title="This course is not assigned to you" description="Request it from the Learning Roadmap. A pending request grants no access." />;
  return <CourseView db={db} course={course} version={version} traineeUserId={user.id} basePath={`/trainee/roadmap/${courseId}`} backHref="/trainee/roadmap" />;
}
