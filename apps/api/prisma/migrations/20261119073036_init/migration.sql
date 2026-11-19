-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationKey" AS ENUM ('ERP', 'TEAMS', 'YOUTUBE', 'AI', 'EMAIL', 'ROADMAP');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'AUTHORIZATION_REQUIRED', 'FAILED_RETRY_AVAILABLE', 'STALE_CACHED_DATA', 'CONNECTED');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('FRONTEND', 'BACKEND', 'FULLSTACK', 'QA');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('PHYSICAL', 'ONLINE');

-- CreateEnum
CREATE TYPE "UserResource" AS ENUM ('TRAINEE', 'CENTRAL_LND', 'INDUSTRIAL_ATTACHMENT', 'SBU');

-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('STRONG', 'DEVELOPING', 'NEEDS_REVISION', 'NOT_ASSESSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "QuestionLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'SHORT');

-- CreateEnum
CREATE TYPE "QuestionSetType" AS ENUM ('SUBTOPIC', 'FULL_TOPIC', 'COURSE_FINAL');

-- CreateEnum
CREATE TYPE "QuestionSetSource" AS ENUM ('AI_DRAFT', 'APPROVED_POOL');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('PROVISIONAL', 'FINAL', 'PENDING_OFFLINE');

-- CreateEnum
CREATE TYPE "SubmitReason" AS ENUM ('SUBMITTED', 'TIME_UP', 'TAB_HIDDEN', 'OFFLINE');

-- CreateEnum
CREATE TYPE "IntegrityEventType" AS ENUM ('TAB_HIDDEN', 'COPY_BLOCKED', 'CONTEXT_MENU_BLOCKED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ProctorRule" AS ENUM ('TAB_HIDDEN', 'FULLSCREEN_EXIT', 'COPY_PASTE', 'RIGHT_CLICK', 'PAGE_RELOAD');

-- CreateEnum
CREATE TYPE "QuizEndReason" AS ENUM ('SUBMITTED', 'TIME_UP', 'VIOLATIONS');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('SUGGESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "RetakeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('FRONTEND', 'BACKEND', 'FULLSTACK', 'SQA');

-- CreateEnum
CREATE TYPE "ExpertiseStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "AssignmentSource" AS ENUM ('DIRECT', 'TEAM', 'REQUEST');

-- CreateEnum
CREATE TYPE "CourseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "TopicStateValue" AS ENUM ('NOT_STARTED', 'SELF_DONE', 'SKIPPED', 'MASTERED');

-- CreateEnum
CREATE TYPE "CompletionEventType" AS ENUM ('LESSON_COMPLETED', 'TOPIC_SELF_DONE', 'TOPIC_SKIPPED', 'TOPIC_MASTERED');

-- CreateEnum
CREATE TYPE "TaskCategory" AS ENUM ('SBO', 'LND');

-- CreateEnum
CREATE TYPE "TaskVerification" AS ENUM ('PENDING', 'VERIFIED', 'NOT_CONFIRMED');

-- CreateEnum
CREATE TYPE "SheetColumn" AS ENUM ('YESTERDAY', 'HOURS', 'TODAY', 'BLOCKERS', 'PLAN');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('ERP', 'PM_ENTERED');

-- CreateEnum
CREATE TYPE "IdentityKind" AS ENUM ('TEAMS', 'ERP');

-- CreateEnum
CREATE TYPE "MeetingAttendanceStatus" AS ENUM ('ATTENDED', 'REPORT_PENDING', 'UNMAPPED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('PERSONAL', 'ANNUAL', 'OTHER_APPROVED');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportPeriodType" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'FULL');

-- CreateEnum
CREATE TYPE "MailStatus" AS ENUM ('QUEUED', 'ACCEPTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MailPurpose" AS ENUM ('REPORT', 'TASK_OWNER_APPROVAL');

-- CreateEnum
CREATE TYPE "XpSource" AS ENUM ('ON_TIME_SPRINT', 'VERIFIED_MODULE', 'FINAL_ASSESSMENT', 'KUDOS', 'QUEST', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "XpStatus" AS ENUM ('PENDING', 'AWARDED', 'HELD', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "FreezeSource" AS ENUM ('LEAVE', 'HOLIDAY');

-- CreateEnum
CREATE TYPE "BadgeKind" AS ENUM ('BEHAVIORAL', 'SPECIAL');

-- CreateEnum
CREATE TYPE "BadgeRuleType" AS ENUM ('ON_TIME_SPRINT_STREAK', 'SPRINT_STREAK', 'KUDOS_DISTINCT_SENDERS', 'MANUAL');

-- CreateEnum
CREATE TYPE "BadgeAwardSource" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "KudosCategory" AS ENUM ('HELPFUL', 'GREAT_EXPLANATION', 'TEAMWORK');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pm" (
    "pmId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "photoPath" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pm_pkey" PRIMARY KEY ("pmId")
);

-- CreateTable
CREATE TABLE "User" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "photoPath" TEXT,
    "bio" TEXT,
    "resource" "UserResource" NOT NULL,
    "pmId" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "attendanceMode" "AttendanceMode" NOT NULL,
    "onboardDate" DATE NOT NULL,
    "departureDate" DATE,
    "skillAssessmentMinutes" INTEGER,
    "skillAssessmentMarks" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pmId" TEXT,
    "userId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "passwordChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pmId" TEXT,
    "userId" TEXT,
    "type" "AuthTokenType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pmId" TEXT,
    "userId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "remembered" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pmId" TEXT,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "retakeRequestId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pmId" TEXT,
    "userId" TEXT,
    "category" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" "IntegrationKey" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pmId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionSet" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "moduleId" TEXT,
    "type" "QuestionSetType" NOT NULL,
    "title" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "attemptLimit" INTEGER NOT NULL,
    "source" "QuestionSetSource" NOT NULL DEFAULT 'AI_DRAFT',
    "contentVersion" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rubric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "questionSetId" TEXT,
    "skillId" TEXT,
    "level" "QuestionLevel",
    "type" "QuestionType" NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "retakeRequestId" TEXT,
    "joiningRole" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "improvements" TEXT[],
    "goals" TEXT NOT NULL,
    "practicalAnswer" TEXT,
    "intake" JSONB,
    "status" "ExpertiseStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "level" TEXT,
    "score" INTEGER,
    "total" INTEGER,
    "analysis" JSONB,
    "analysedAt" TIMESTAMP(3),
    "durationMin" INTEGER,
    "timeTakenSec" INTEGER,
    "totalMarks" INTEGER,
    "marksPerQuestion" DECIMAL(8,2),
    "marksObtained" DECIMAL(8,2),
    "endReason" "QuizEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProctoringViolation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expertiseVersionId" TEXT NOT NULL,
    "rule" "ProctorRule" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProctoringViolation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseTechnologyResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expertiseVersionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "status" "SkillStatus" NOT NULL,
    "priority" "Priority" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseTechnologyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertiseAnswer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expertiseVersionId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "correct" BOOLEAN NOT NULL,
    "skipped" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpertiseAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "objectiveScore" INTEGER NOT NULL,
    "objectiveTotal" INTEGER NOT NULL,
    "finalScore" INTEGER,
    "status" "AttemptStatus" NOT NULL,
    "submitReason" "SubmitReason" NOT NULL,
    "mastered" BOOLEAN NOT NULL DEFAULT false,
    "finalisedById" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "type" "IntegrityEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "answerText" TEXT,
    "isCorrect" BOOLEAN,
    "aiScore" DECIMAL(6,2),
    "aiRationale" TEXT,
    "pmScore" DECIMAL(6,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "expertiseVersionId" TEXT,
    "reason" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'SUGGESTED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetakeRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RetakeStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "totalMarks" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetakeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectorSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "sector" "Sector" NOT NULL,
    "avgScore" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "track" TEXT,
    "description" TEXT NOT NULL,
    "targetSkills" TEXT[],
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModulePrerequisite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModulePrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonContent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "videoUrl" TEXT,
    "filePath" TEXT NOT NULL,
    "codeExamples" JSONB,
    "references" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "source" "AssignmentSource" NOT NULL DEFAULT 'DIRECT',
    "dueDate" DATE,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CourseRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnerTopicState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "state" "TopicStateValue" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerTopicState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonProgress" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "videoCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CompletionEventType" NOT NULL,
    "moduleId" TEXT,
    "lessonId" TEXT,
    "attemptId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompletionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOwner" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TaskCategory" NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TaskCategory" NOT NULL,
    "plannedHours" DECIMAL(4,1) NOT NULL,
    "actualHours" DECIMAL(4,1) NOT NULL DEFAULT 0,
    "blocker" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "carriedFromId" TEXT,
    "ownerId" TEXT,
    "verification" "TaskVerification",
    "ownerRequestedAt" TIMESTAMP(3),
    "ownerRepliedAt" TIMESTAMP(3),
    "ownerReplyById" TEXT,
    "pendingAlertSentAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "onTime" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SprintWeek" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SprintWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsSheetCell" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "column" "SheetColumn" NOT NULL,
    "value" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorPmId" TEXT,
    "authorUserId" TEXT,
    "updatedByPmId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsSheetCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsSheetCellVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "value" TEXT NOT NULL,
    "editedByPmId" TEXT,
    "editedByUserId" TEXT,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsSheetCellVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DsMeeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "teamId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "teamsLink" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DsMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityMapping" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "IdentityKind" NOT NULL,
    "externalId" TEXT NOT NULL,
    "mappedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "entryTime" TIME(0),
    "exitTime" TIME(0),
    "hours" DECIMAL(4,1),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "isOfficeTrip" BOOLEAN NOT NULL DEFAULT false,
    "source" "AttendanceSource" NOT NULL DEFAULT 'ERP',
    "enteredById" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "teamsIdentity" TEXT NOT NULL,
    "meeting" TEXT NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "firstJoinAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "lateMinutes" INTEGER,
    "status" "MeetingAttendanceStatus" NOT NULL DEFAULT 'REPORT_PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingInterval" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "meetingAttendanceId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingInterval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "integrationKey" "IntegrationKey" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" "LeaveType" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "decidedById" TEXT NOT NULL,
    "outcome" "LeaveStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationDate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" "ReportPeriodType" NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "note" TEXT,
    "savedById" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "purpose" "MailPurpose" NOT NULL,
    "reportId" TEXT,
    "reportVersionId" TEXT,
    "sprintTaskId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "MailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" "MailStatus" NOT NULL,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "verifiedModule" INTEGER NOT NULL DEFAULT 10,
    "verifiedModuleDailyCap" INTEGER NOT NULL DEFAULT 30,
    "onTimeSprint" INTEGER NOT NULL DEFAULT 20,
    "finalAssessment" INTEGER NOT NULL DEFAULT 40,
    "kudos" INTEGER NOT NULL DEFAULT 5,
    "kudosSendLimitPerWeek" INTEGER NOT NULL DEFAULT 3,
    "kudosCooldownDays" INTEGER NOT NULL DEFAULT 7,
    "kudosReceivedCapPerWeek" INTEGER NOT NULL DEFAULT 15,
    "streakMilestone" INTEGER NOT NULL DEFAULT 25,
    "streakMilestoneDays" INTEGER NOT NULL DEFAULT 5,
    "pmReviewMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1,
    "engagementDropAlertPct" INTEGER NOT NULL DEFAULT 30,
    "sprintCutoff" TEXT NOT NULL DEFAULT '10:00',
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minXp" INTEGER NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "XpSource" NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "XpStatus" NOT NULL DEFAULT 'PENDING',
    "key" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "reason" TEXT,
    "flag" TEXT,
    "occurredOn" DATE NOT NULL,
    "kudosId" TEXT,
    "questId" TEXT,
    "attemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "xpEventId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "fromStatus" "XpStatus" NOT NULL,
    "toStatus" "XpStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Streak" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastSubmissionDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Streak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakFreeze" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "FreezeSource" NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreakFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "kind" "BadgeKind" NOT NULL,
    "criteria" TEXT NOT NULL,
    "ruleType" "BadgeRuleType" NOT NULL DEFAULT 'MANUAL',
    "threshold" INTEGER,
    "createdById" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3),
    "retiredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BadgeAwardSource" NOT NULL,
    "evidence" TEXT NOT NULL,
    "attemptId" TEXT,
    "projectUrl" TEXT,
    "projectReviewed" BOOLEAN NOT NULL DEFAULT false,
    "awardedById" TEXT NOT NULL,
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestProgress" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kudos" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "category" "KudosCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "sentOn" DATE NOT NULL,
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Pm_workspaceId_email_key" ON "Pm"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "User_workspaceId_resource_idx" ON "User"("workspaceId", "resource");

-- CreateIndex
CREATE INDEX "User_workspaceId_archivedAt_idx" ON "User"("workspaceId", "archivedAt");

-- CreateIndex
CREATE INDEX "User_pmId_idx" ON "User"("pmId");

-- CreateIndex
CREATE UNIQUE INDEX "User_workspaceId_email_key" ON "User"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_pmId_key" ON "Credential"("pmId");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_userId_key" ON "Credential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_pmId_type_idx" ON "AuthToken"("pmId", "type");

-- CreateIndex
CREATE INDEX "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_pmId_endedAt_idx" ON "Session"("pmId", "endedAt");

-- CreateIndex
CREATE INDEX "Session_userId_endedAt_idx" ON "Session"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "Notification_pmId_readAt_idx" ON "Notification"("pmId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_pmId_category_key" ON "NotificationPreference"("pmId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_category_key" ON "NotificationPreference"("userId", "category");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_availableAt_idx" ON "OutboxEvent"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_workspaceId_key_key" ON "Integration"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "UserSkill_skillId_idx" ON "UserSkill"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_skillId_key" ON "UserSkill"("userId", "skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_workspaceId_name_key" ON "Team"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_teamId_userId_key" ON "Membership"("teamId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackVersion_userId_version_key" ON "FeedbackVersion"("userId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_workspaceId_name_key" ON "Skill"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "QuestionSet_courseId_idx" ON "QuestionSet"("courseId");

-- CreateIndex
CREATE INDEX "QuestionSet_moduleId_idx" ON "QuestionSet"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "Rubric_questionSetId_version_key" ON "Rubric"("questionSetId", "version");

-- CreateIndex
CREATE INDEX "Question_questionSetId_idx" ON "Question"("questionSetId");

-- CreateIndex
CREATE INDEX "Question_skillId_level_idx" ON "Question"("skillId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_order_key" ON "QuestionOption"("questionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseVersion_retakeRequestId_key" ON "ExpertiseVersion"("retakeRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseVersion_userId_version_key" ON "ExpertiseVersion"("userId", "version");

-- CreateIndex
CREATE INDEX "ProctoringViolation_expertiseVersionId_idx" ON "ProctoringViolation"("expertiseVersionId");

-- CreateIndex
CREATE INDEX "ExpertiseTechnologyResult_skillId_idx" ON "ExpertiseTechnologyResult"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseTechnologyResult_expertiseVersionId_skillId_key" ON "ExpertiseTechnologyResult"("expertiseVersionId", "skillId");

-- CreateIndex
CREATE INDEX "ExpertiseAnswer_questionId_idx" ON "ExpertiseAnswer"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpertiseAnswer_expertiseVersionId_questionId_key" ON "ExpertiseAnswer"("expertiseVersionId", "questionId");

-- CreateIndex
CREATE INDEX "Attempt_questionSetId_idx" ON "Attempt"("questionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_questionSetId_attemptNo_key" ON "Attempt"("userId", "questionSetId", "attemptNo");

-- CreateIndex
CREATE INDEX "IntegrityEvent_attemptId_idx" ON "IntegrityEvent"("attemptId");

-- CreateIndex
CREATE INDEX "Response_questionId_idx" ON "Response"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_attemptId_questionId_key" ON "Response"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Appeal_attemptId_status_idx" ON "Appeal"("attemptId", "status");

-- CreateIndex
CREATE INDEX "Appeal_userId_idx" ON "Appeal"("userId");

-- CreateIndex
CREATE INDEX "Recommendation_courseId_idx" ON "Recommendation"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Recommendation_userId_courseId_key" ON "Recommendation"("userId", "courseId");

-- CreateIndex
CREATE INDEX "RetakeRequest_userId_status_idx" ON "RetakeRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SectorSnapshot_workspaceId_month_sector_key" ON "SectorSnapshot"("workspaceId", "month", "sector");

-- CreateIndex
CREATE INDEX "Course_workspaceId_idx" ON "Course"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_workspaceId_title_key" ON "Course"("workspaceId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Course_workspaceId_slug_key" ON "Course"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "CourseModule_workspaceId_idx" ON "CourseModule"("workspaceId");

-- CreateIndex
CREATE INDEX "CourseModule_courseId_idx" ON "CourseModule"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseModule_courseId_order_key" ON "CourseModule"("courseId", "order");

-- CreateIndex
CREATE INDEX "ModulePrerequisite_prerequisiteId_idx" ON "ModulePrerequisite"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "ModulePrerequisite_moduleId_prerequisiteId_key" ON "ModulePrerequisite"("moduleId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "LessonContent_workspaceId_idx" ON "LessonContent"("workspaceId");

-- CreateIndex
CREATE INDEX "LessonContent_moduleId_idx" ON "LessonContent"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonContent_moduleId_order_key" ON "LessonContent"("moduleId", "order");

-- CreateIndex
CREATE INDEX "CourseAssignment_courseId_idx" ON "CourseAssignment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignment_userId_courseId_key" ON "CourseAssignment"("userId", "courseId");

-- CreateIndex
CREATE INDEX "CourseRequest_userId_courseId_status_idx" ON "CourseRequest"("userId", "courseId", "status");

-- CreateIndex
CREATE INDEX "CourseRequest_courseId_idx" ON "CourseRequest"("courseId");

-- CreateIndex
CREATE INDEX "LearnerTopicState_moduleId_idx" ON "LearnerTopicState"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "LearnerTopicState_userId_moduleId_key" ON "LearnerTopicState"("userId", "moduleId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonProgress_userId_lessonId_key" ON "LessonProgress"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "CompletionEvent_userId_occurredAt_moduleId_idx" ON "CompletionEvent"("userId", "occurredAt", "moduleId");

-- CreateIndex
CREATE INDEX "CompletionEvent_moduleId_idx" ON "CompletionEvent"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOwner_workspaceId_email_key" ON "TaskOwner"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "SprintTask_userId_date_idx" ON "SprintTask"("userId", "date");

-- CreateIndex
CREATE INDEX "SprintTask_verification_ownerRequestedAt_idx" ON "SprintTask"("verification", "ownerRequestedAt");

-- CreateIndex
CREATE INDEX "SprintTask_ownerId_idx" ON "SprintTask"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SprintSubmission_userId_date_key" ON "SprintSubmission"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SprintWeek_teamId_weekStart_key" ON "SprintWeek"("teamId", "weekStart");

-- CreateIndex
CREATE INDEX "DsSheetCell_userId_idx" ON "DsSheetCell"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DsSheetCell_weekId_userId_date_column_key" ON "DsSheetCell"("weekId", "userId", "date", "column");

-- CreateIndex
CREATE UNIQUE INDEX "DsSheetCellVersion_cellId_version_key" ON "DsSheetCellVersion"("cellId", "version");

-- CreateIndex
CREATE INDEX "DsMeeting_scheduledAt_idx" ON "DsMeeting"("scheduledAt");

-- CreateIndex
CREATE INDEX "IdentityMapping_userId_idx" ON "IdentityMapping"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IdentityMapping_workspaceId_kind_externalId_key" ON "IdentityMapping"("workspaceId", "kind", "externalId");

-- CreateIndex
CREATE INDEX "Attendance_workspaceId_date_idx" ON "Attendance"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "MeetingAttendance_userId_scheduledStart_idx" ON "MeetingAttendance"("userId", "scheduledStart");

-- CreateIndex
CREATE INDEX "MeetingInterval_meetingAttendanceId_idx" ON "MeetingInterval"("meetingAttendanceId");

-- CreateIndex
CREATE INDEX "SyncRun_integrationKey_startedAt_idx" ON "SyncRun"("integrationKey", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_workspaceId_date_key" ON "PublicHoliday"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveDecision_leaveRequestId_key" ON "LeaveDecision"("leaveRequestId");

-- CreateIndex
CREATE INDEX "ReconciliationRequest_userId_status_idx" ON "ReconciliationRequest"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationDate_requestId_date_key" ON "ReconciliationDate"("requestId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Report_userId_periodType_periodStart_periodEnd_key" ON "Report"("userId", "periodType", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReportVersion_reportId_publishedAt_idx" ON "ReportVersion"("reportId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportVersion_reportId_version_key" ON "ReportVersion"("reportId", "version");

-- CreateIndex
CREATE INDEX "ReportFile_versionId_idx" ON "ReportFile"("versionId");

-- CreateIndex
CREATE INDEX "MailDelivery_reportId_idx" ON "MailDelivery"("reportId");

-- CreateIndex
CREATE INDEX "MailDelivery_sprintTaskId_idx" ON "MailDelivery"("sprintTaskId");

-- CreateIndex
CREATE INDEX "MailDelivery_status_idx" ON "MailDelivery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MailAttempt_deliveryId_attemptNo_key" ON "MailAttempt"("deliveryId", "attemptNo");

-- CreateIndex
CREATE UNIQUE INDEX "XpRule_workspaceId_key" ON "XpRule"("workspaceId");

-- CreateIndex
CREATE INDEX "Level_workspaceId_retiredAt_idx" ON "Level"("workspaceId", "retiredAt");

-- CreateIndex
CREATE INDEX "XpEvent_userId_status_occurredOn_idx" ON "XpEvent"("userId", "status", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "XpEvent_workspaceId_key_key" ON "XpEvent"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "XpReview_xpEventId_idx" ON "XpReview"("xpEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Streak_userId_key" ON "Streak"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StreakFreeze_userId_date_key" ON "StreakFreeze"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_workspaceId_name_key" ON "Badge"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "BadgeAward_userId_revokedAt_idx" ON "BadgeAward"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeAward_badgeId_userId_key" ON "BadgeAward"("badgeId", "userId");

-- CreateIndex
CREATE INDEX "Quest_workspaceId_startDate_endDate_idx" ON "Quest"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "QuestProgress_userId_idx" ON "QuestProgress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestProgress_questId_userId_key" ON "QuestProgress"("questId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardPreference_userId_key" ON "LeaderboardPreference"("userId");

-- CreateIndex
CREATE INDEX "Kudos_fromUserId_sentOn_idx" ON "Kudos"("fromUserId", "sentOn");

-- CreateIndex
CREATE INDEX "Kudos_toUserId_sentOn_idx" ON "Kudos"("toUserId", "sentOn");

-- AddForeignKey
ALTER TABLE "Pm" ADD CONSTRAINT "Pm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credential" ADD CONSTRAINT "Credential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_retakeRequestId_fkey" FOREIGN KEY ("retakeRequestId") REFERENCES "RetakeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVersion" ADD CONSTRAINT "FeedbackVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVersion" ADD CONSTRAINT "FeedbackVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackVersion" ADD CONSTRAINT "FeedbackVersion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSet" ADD CONSTRAINT "QuestionSet_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSet" ADD CONSTRAINT "QuestionSet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSet" ADD CONSTRAINT "QuestionSet_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionSet" ADD CONSTRAINT "QuestionSet_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rubric" ADD CONSTRAINT "Rubric_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseVersion" ADD CONSTRAINT "ExpertiseVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseVersion" ADD CONSTRAINT "ExpertiseVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseVersion" ADD CONSTRAINT "ExpertiseVersion_retakeRequestId_fkey" FOREIGN KEY ("retakeRequestId") REFERENCES "RetakeRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringViolation" ADD CONSTRAINT "ProctoringViolation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringViolation" ADD CONSTRAINT "ProctoringViolation_expertiseVersionId_fkey" FOREIGN KEY ("expertiseVersionId") REFERENCES "ExpertiseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseTechnologyResult" ADD CONSTRAINT "ExpertiseTechnologyResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseTechnologyResult" ADD CONSTRAINT "ExpertiseTechnologyResult_expertiseVersionId_fkey" FOREIGN KEY ("expertiseVersionId") REFERENCES "ExpertiseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseTechnologyResult" ADD CONSTRAINT "ExpertiseTechnologyResult_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseAnswer" ADD CONSTRAINT "ExpertiseAnswer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseAnswer" ADD CONSTRAINT "ExpertiseAnswer_expertiseVersionId_fkey" FOREIGN KEY ("expertiseVersionId") REFERENCES "ExpertiseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseAnswer" ADD CONSTRAINT "ExpertiseAnswer_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseAnswer" ADD CONSTRAINT "ExpertiseAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertiseAnswer" ADD CONSTRAINT "ExpertiseAnswer_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "QuestionSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_finalisedById_fkey" FOREIGN KEY ("finalisedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityEvent" ADD CONSTRAINT "IntegrityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrityEvent" ADD CONSTRAINT "IntegrityEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "QuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_expertiseVersionId_fkey" FOREIGN KEY ("expertiseVersionId") REFERENCES "ExpertiseVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetakeRequest" ADD CONSTRAINT "RetakeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectorSnapshot" ADD CONSTRAINT "SectorSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseModule" ADD CONSTRAINT "CourseModule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePrerequisite" ADD CONSTRAINT "ModulePrerequisite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePrerequisite" ADD CONSTRAINT "ModulePrerequisite_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePrerequisite" ADD CONSTRAINT "ModulePrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonContent" ADD CONSTRAINT "LessonContent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonContent" ADD CONSTRAINT "LessonContent_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseRequest" ADD CONSTRAINT "CourseRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerTopicState" ADD CONSTRAINT "LearnerTopicState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerTopicState" ADD CONSTRAINT "LearnerTopicState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnerTopicState" ADD CONSTRAINT "LearnerTopicState_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonProgress" ADD CONSTRAINT "LessonProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LessonContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "LessonContent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionEvent" ADD CONSTRAINT "CompletionEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOwner" ADD CONSTRAINT "TaskOwner_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_carriedFromId_fkey" FOREIGN KEY ("carriedFromId") REFERENCES "SprintTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "TaskOwner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintTask" ADD CONSTRAINT "SprintTask_ownerReplyById_fkey" FOREIGN KEY ("ownerReplyById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintSubmission" ADD CONSTRAINT "SprintSubmission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintSubmission" ADD CONSTRAINT "SprintSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintWeek" ADD CONSTRAINT "SprintWeek_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintWeek" ADD CONSTRAINT "SprintWeek_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "SprintWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_authorPmId_fkey" FOREIGN KEY ("authorPmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_updatedByPmId_fkey" FOREIGN KEY ("updatedByPmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCell" ADD CONSTRAINT "DsSheetCell_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCellVersion" ADD CONSTRAINT "DsSheetCellVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCellVersion" ADD CONSTRAINT "DsSheetCellVersion_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "DsSheetCell"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCellVersion" ADD CONSTRAINT "DsSheetCellVersion_editedByPmId_fkey" FOREIGN KEY ("editedByPmId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsSheetCellVersion" ADD CONSTRAINT "DsSheetCellVersion_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsMeeting" ADD CONSTRAINT "DsMeeting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsMeeting" ADD CONSTRAINT "DsMeeting_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DsMeeting" ADD CONSTRAINT "DsMeeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityMapping" ADD CONSTRAINT "IdentityMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityMapping" ADD CONSTRAINT "IdentityMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityMapping" ADD CONSTRAINT "IdentityMapping_mappedById_fkey" FOREIGN KEY ("mappedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInterval" ADD CONSTRAINT "MeetingInterval_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingInterval" ADD CONSTRAINT "MeetingInterval_meetingAttendanceId_fkey" FOREIGN KEY ("meetingAttendanceId") REFERENCES "MeetingAttendance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicHoliday" ADD CONSTRAINT "PublicHoliday_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDecision" ADD CONSTRAINT "LeaveDecision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDecision" ADD CONSTRAINT "LeaveDecision_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveDecision" ADD CONSTRAINT "LeaveDecision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRequest" ADD CONSTRAINT "ReconciliationRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRequest" ADD CONSTRAINT "ReconciliationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationRequest" ADD CONSTRAINT "ReconciliationRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDate" ADD CONSTRAINT "ReconciliationDate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationDate" ADD CONSTRAINT "ReconciliationDate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ReconciliationRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportVersion" ADD CONSTRAINT "ReportVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ReportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportFile" ADD CONSTRAINT "ReportFile_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_reportVersionId_fkey" FOREIGN KEY ("reportVersionId") REFERENCES "ReportVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailDelivery" ADD CONSTRAINT "MailDelivery_sprintTaskId_fkey" FOREIGN KEY ("sprintTaskId") REFERENCES "SprintTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttempt" ADD CONSTRAINT "MailAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAttempt" ADD CONSTRAINT "MailAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "MailDelivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpRule" ADD CONSTRAINT "XpRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpRule" ADD CONSTRAINT "XpRule_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_kudosId_fkey" FOREIGN KEY ("kudosId") REFERENCES "Kudos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpReview" ADD CONSTRAINT "XpReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpReview" ADD CONSTRAINT "XpReview_xpEventId_fkey" FOREIGN KEY ("xpEventId") REFERENCES "XpEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpReview" ADD CONSTRAINT "XpReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Streak" ADD CONSTRAINT "Streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakFreeze" ADD CONSTRAINT "StreakFreeze_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakFreeze" ADD CONSTRAINT "StreakFreeze_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakFreeze" ADD CONSTRAINT "StreakFreeze_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Badge" ADD CONSTRAINT "Badge_retiredById_fkey" FOREIGN KEY ("retiredById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestProgress" ADD CONSTRAINT "QuestProgress_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "Pm"("pmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardPreference" ADD CONSTRAINT "LeaderboardPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaderboardPreference" ADD CONSTRAINT "LeaderboardPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kudos" ADD CONSTRAINT "Kudos_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===== DB rules (hand-written) =====

-- exactly one of pmId / userId
ALTER TABLE "Credential" ADD CONSTRAINT chk_credential_owner CHECK (("pmId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "AuthToken" ADD CONSTRAINT chk_authtoken_owner CHECK (("pmId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "Session" ADD CONSTRAINT chk_session_owner CHECK (("pmId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "Notification" ADD CONSTRAINT chk_notification_owner CHECK (("pmId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "NotificationPreference" ADD CONSTRAINT chk_notifpref_owner CHECK (("pmId" IS NULL) <> ("userId" IS NULL));
ALTER TABLE "DsSheetCell" ADD CONSTRAINT chk_dscell_author CHECK (("authorPmId" IS NULL) <> ("authorUserId" IS NULL));
ALTER TABLE "DsSheetCell" ADD CONSTRAINT chk_dscell_updater CHECK (("updatedByPmId" IS NULL) <> ("updatedByUserId" IS NULL));
ALTER TABLE "DsSheetCellVersion" ADD CONSTRAINT chk_dscellver_editor CHECK (("editedByPmId" IS NULL) <> ("editedByUserId" IS NULL));

-- user rules
ALTER TABLE "User" ADD CONSTRAINT chk_user_departure CHECK ("departureDate" IS NULL OR "departureDate" > "onboardDate");
ALTER TABLE "User" ADD CONSTRAINT chk_user_minutes CHECK ("skillAssessmentMinutes" IS NULL OR "skillAssessmentMinutes" BETWEEN 1 AND 180);
ALTER TABLE "User" ADD CONSTRAINT chk_user_marks CHECK ("skillAssessmentMarks" IS NULL OR "skillAssessmentMarks" BETWEEN 1 AND 1000);

-- assessment
ALTER TABLE "QuestionSet" ADD CONSTRAINT chk_qset_limit CHECK ("attemptLimit" >= 1);
ALTER TABLE "Attempt" ADD CONSTRAINT chk_attempt_score CHECK ("finalScore" IS NULL OR "finalScore" BETWEEN 0 AND 100);
ALTER TABLE "RetakeRequest" ADD CONSTRAINT chk_retake_minutes CHECK ("minutes" IS NULL OR "minutes" BETWEEN 1 AND 180);
ALTER TABLE "RetakeRequest" ADD CONSTRAINT chk_retake_marks CHECK ("totalMarks" IS NULL OR "totalMarks" BETWEEN 1 AND 1000);
CREATE UNIQUE INDEX uq_retake_open ON "RetakeRequest" ("userId") WHERE "status" IN ('PENDING', 'APPROVED');

-- course request
CREATE UNIQUE INDEX uq_courserequest_open ON "CourseRequest" ("userId", "courseId") WHERE "status" IN ('PENDING', 'APPROVED');

-- attendance, leave, sprint
ALTER TABLE "Attendance" ADD CONSTRAINT chk_attendance_exit CHECK ("exitTime" IS NULL OR "entryTime" IS NULL OR "exitTime" > "entryTime");
ALTER TABLE "LeaveRequest" ADD CONSTRAINT chk_leave_dates CHECK ("endDate" >= "startDate");
ALTER TABLE "SprintTask" ADD CONSTRAINT chk_task_planned CHECK ("plannedHours" >= 0);
ALTER TABLE "SprintTask" ADD CONSTRAINT chk_task_actual CHECK ("actualHours" >= 0);

-- growth
ALTER TABLE "XpRule" ADD CONSTRAINT chk_xprule_nonneg CHECK ("verifiedModule" >= 0 AND "verifiedModuleDailyCap" >= 0 AND "onTimeSprint" >= 0 AND "finalAssessment" >= 0 AND "kudos" >= 0 AND "kudosSendLimitPerWeek" >= 0 AND "kudosCooldownDays" >= 0 AND "kudosReceivedCapPerWeek" >= 0 AND "streakMilestone" >= 0 AND "streakMilestoneDays" >= 0 AND "pmReviewMultiplier" >= 0 AND "engagementDropAlertPct" >= 0);
ALTER TABLE "Quest" ADD CONSTRAINT chk_quest_target CHECK ("target" >= 1);
ALTER TABLE "Quest" ADD CONSTRAINT chk_quest_dates CHECK ("endDate" >= "startDate");
ALTER TABLE "Kudos" ADD CONSTRAINT chk_kudos_self CHECK ("fromUserId" <> "toUserId");

-- an email must not exist in both Pm and User
CREATE FUNCTION fn_pm_email_unique() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "workspaceId" = NEW."workspaceId" AND lower("email") = lower(NEW."email")) THEN
    RAISE EXCEPTION 'email % is already used by a User', NEW."email";
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE FUNCTION fn_user_email_unique() RETURNS trigger AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM "Pm" WHERE "workspaceId" = NEW."workspaceId" AND lower("email") = lower(NEW."email")) THEN
    RAISE EXCEPTION 'email % is already used by a PM', NEW."email";
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pm_email BEFORE INSERT OR UPDATE OF "email" ON "Pm" FOR EACH ROW EXECUTE FUNCTION fn_pm_email_unique();
CREATE TRIGGER trg_user_email BEFORE INSERT OR UPDATE OF "email" ON "User" FOR EACH ROW EXECUTE FUNCTION fn_user_email_unique();
