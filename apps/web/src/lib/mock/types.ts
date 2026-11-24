// Types mirror the SRS v1.1 §3 draft data model. Field names follow the SRS so the
// NestJS/Prisma backend can map 1:1. All dates are ISO strings (YYYY-MM-DD or full ISO).

export type Role = "PM" | "TRAINEE";
export type Position = "FRONTEND" | "BACKEND" | "FULLSTACK" | "QA";
/** Dashboard sector derived from a trainee's Position (Frontend, Backend, Full-Stack, SQA). */
export type Sector = "frontend" | "backend" | "fullstack" | "sqa";
export type AttendanceMode = "PHYSICAL" | "ONLINE";
export type Resource = "TRAINEE" | "CENTRAL_LND" | "INDUSTRIAL_ATTACHMENT" | "SBU";
export type SourceStatus = "connected" | "sample" | "unavailable" | "PM-entered";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  /** Mock only. The real backend stores a salted slow hash (FR-AUTH-06). */
  password: string;
  mustChangePassword: boolean;
  /** Login ID of a PM account created from the dashboard (Add PM). */
  pmCode?: string;
  emailVerified: boolean;
  photoUrl?: string;
  bio?: string;
  createdAt: string;
}

export interface Trainee {
  userId: string;
  traineeId: string; // e.g. BS23001
  position: Position;
  attendanceMode: AttendanceMode;
  resource: Resource;
  onboardDate: string;
  /** Departure date: the user moves to the Archive (inactive) on this date. Empty = not set (reactivated user). */
  periodEnd: string;
  /** Set by the PM when the user is added: time and total marks for the first-login skill assessment. */
  skillAssessmentMinutes?: number;
  skillAssessmentMarks?: number;
  /** Set while the user is archived/inactive; cleared when a PM activates them again. */
  archivedAt?: string;
  skills: string[];
  teamIds: string[];
  pmId: string;
  hideFromLeaderboard: boolean;
}

export interface Team {
  id: string;
  name: string;
  pmId: string;
}

export interface Session {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  device: string;
}

export type SkillStatus = "Strong" | "Developing" | "Needs revision" | "Not assessed";
export type Priority = "High" | "Medium" | "Low";

export interface TechResult {
  technology: string;
  correct: number;
  total: number;
  skipped: number;
  status: SkillStatus;
  priority: Priority;
}

export interface EvaluationResult {
  technology: string;
  questionId: string;
  answer: string | null;
  correct: boolean;
  skipped: boolean;
}

/** Answers to the 10-question intake (step 1 of the skill assessment). */
export interface IntakeSkillAnswer {
  ability: string;
  duration: string;
  lastUsed: string;
}

export interface IntakeAnswers {
  level: string; // Q1
  workTypes: string[]; // Q2
  roles: string[]; // Q3 (up to three)
  rolesNotSure: boolean; // Q3
  skills: string[]; // Q4
  noSkills: boolean; // Q4
  perSkill: Record<string, IntakeSkillAnswer>; // Q5-Q7, one entry per skill in Q4
  projectKind: string; // Q8
  projectDescription: string; // Q8
  contribution: string; // Q9
  contributionSkills: string[]; // Q9
  contributionNA: boolean; // Q9
  lessConfident: string[]; // Q10
  lessConfidentNotSure: boolean; // Q10
  lessConfidentNotes: string; // Q10
}

export type ProctorRule = "TAB_HIDDEN" | "FULLSCREEN_EXIT" | "COPY_PASTE" | "RIGHT_CLICK" | "PAGE_RELOAD";

/** How the timed, proctored skill quiz went. */
export interface ProctoringRecord {
  durationMin: number;
  timeTakenSec: number;
  /** Total marks set by the PM for this trainee's assessment, and how they were spread over the questions. */
  totalMarks?: number;
  marksPerQuestion?: number;
  marksObtained?: number;
  endReason: "SUBMITTED" | "TIME_UP" | "VIOLATIONS";
  violations: { rule: ProctorRule; at: string }[];
}

export interface ExpertiseEvaluation {
  id: string;
  traineeUserId: string;
  version: number;
  joiningRole: string;
  technologies: string[];
  experience: string;
  confidence: string;
  improvements: string[];
  goals: string;
  practicalAnswer: string;
  /** Present for assessments taken with the 10-question intake. */
  intake?: IntakeAnswers;
  /** Present for quizzes taken in the proctored quiz screen. */
  proctoring?: ProctoringRecord;
  level: string;
  score: number;
  total: number;
  results: TechResult[];
  answers: EvaluationResult[];
  createdAt: string;
}

export interface Subtopic {
  id: string;
  name: string;
  theory: string;
  example: string;
  pseudocode: string;
  resources: string[];
}

export interface Topic {
  id: string;
  name: string;
  order: number;
  prerequisites: string[]; // topic ids
  outcomes: string[];
  subtopics: Subtopic[];
}

export interface CourseVersion {
  id: string;
  version: string;
  status: "PUBLISHED" | "DRAFT" | "RETIRED";
  approvedBy?: string;
  approvedAt?: string;
  topics: Topic[];
}

export interface Course {
  id: string;
  title: string;
  track: string;
  description: string;
  source: "ROADMAP_API" | "PM_ADDED";
  createdBy?: string;
  /** Technologies this course covers; used to match skill-analysis gaps. */
  covers: string[];
  versions: CourseVersion[];
}

export interface SuggestionApproval {
  traineeUserId: string;
  courseId: string;
  approvedBy: string;
  approvedAt: string;
}

export interface Assignment {
  id: string;
  traineeUserId: string;
  courseId: string;
  courseVersionId: string;
  assignedBy: string;
  assignedAt: string;
  dueDate?: string;
  source: "DIRECT" | "TEAM" | "REQUEST";
}

export interface CourseRequest {
  id: string;
  traineeUserId: string;
  courseId: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export type TopicStateValue = "NOT_STARTED" | "SELF_DONE" | "SKIPPED" | "MASTERED";

export interface TopicState {
  traineeUserId: string;
  topicId: string;
  state: TopicStateValue;
}

export interface SubtopicProgress {
  traineeUserId: string;
  subtopicId: string;
  completedAt: string;
}

export interface Question {
  id: string;
  text: string;
  type: "MCQ" | "SHORT";
  options?: string[];
  answerKey?: number; // index into options for MCQ
}

export interface QuestionSet {
  id: string;
  courseId: string;
  topicId?: string;
  type: "SUBTOPIC" | "FULL_TOPIC" | "COURSE_FINAL";
  title: string;
  durationMin: number;
  attemptLimit: number;
  rubric: string;
  source: "AI_DRAFT" | "APPROVED_POOL";
  contentVersion: string;
  rubricVersion: string;
  approvedBy?: string;
  questions: Question[];
}

export interface IntegrityEvent {
  type: "TAB_HIDDEN" | "COPY_BLOCKED" | "CONTEXT_MENU_BLOCKED" | "OFFLINE";
  at: string;
}

export interface Attempt {
  id: string;
  traineeUserId: string;
  questionSetId: string;
  attemptNo: number;
  answers: Record<string, string>;
  objectiveScore: number;
  objectiveTotal: number;
  finalScore?: number; // percentage after PM review
  status: "PROVISIONAL" | "FINAL" | "PENDING_OFFLINE";
  submitReason: "SUBMITTED" | "TIME_UP" | "TAB_HIDDEN" | "OFFLINE";
  integrityEvents: IntegrityEvent[];
  startedAt: string;
  submittedAt: string;
}

export interface Appeal {
  id: string;
  attemptId: string;
  traineeUserId: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

export interface SprintTask {
  id: string;
  traineeUserId: string;
  title: string;
  description: string;
  category: "SBO" | "LND";
  plannedHours: number;
  plannedStart: string; // HH:mm
  plannedEnd: string; // HH:mm
  actualHours: number;
  blocker: string;
  done: boolean;
  date: string;
  carriedFrom?: string;
  /** L&D team or SBU the task is done for; they are emailed to verify it. */
  ownerId?: string;
  verification?: TaskVerification;
  /** When the approval-request email was queued; used to flag a missing reply after a day. */
  ownerRequestedAt?: string;
  /** Set once the PM was told that the owner has not replied for a day. */
  pendingAlertSent?: boolean;
}

export type TaskVerification = "PENDING" | "VERIFIED" | "NOT_CONFIRMED";

/** A specific L&D team ("LND") or SBU ("SBO") that a trainee can do tasks for. */
export interface TaskOwner {
  id: string;
  name: string;
  kind: "LND" | "SBO";
  email: string;
}

export interface SprintSubmission {
  traineeUserId: string;
  date: string;
  time: string;
  onTime: boolean;
}

export type DSColumn = "YESTERDAY" | "HOURS" | "TODAY" | "BLOCKERS" | "PLAN";

export interface DSCellEdit {
  value: string;
  by: string;
  at: string;
}

export interface DSCell {
  id: string; // `${weekId}|${traineeUserId}|${date}|${column}`
  weekId: string;
  traineeUserId: string;
  date: string;
  column: DSColumn;
  value: string;
  authorId: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  history: DSCellEdit[];
}

export interface SprintWeek {
  id: string;
  teamId: string;
  weekStart: string; // Monday
}

export interface DSMeeting {
  id: string;
  title: string;
  teamId: string | "ALL";
  date: string;
  time: string;
  teamsLink?: string;
  createdBy: string;
}

export interface AttendanceRecord {
  id: string;
  traineeUserId: string;
  date: string;
  entry?: string;
  exit?: string;
  lateMinutes: number;
  hours?: number;
  source: "ERP" | "PM_ENTERED";
  syncedAt: string;
}

export interface MeetingAttendance {
  id: string;
  traineeUserId?: string;
  teamsIdentity: string;
  meeting: string;
  scheduledStart: string;
  firstJoin?: string;
  intervals: { join: string; leave: string }[];
  durationMinutes?: number;
  lateMinutes?: number;
  status: "ATTENDED" | "REPORT_PENDING" | "UNMAPPED";
}

export interface LeaveRequest {
  id: string;
  traineeUserId: string;
  start: string;
  end: string;
  type: "Personal" | "Annual" | "Other approved";
  reason: string;
  status: "PENDING" | "APPROVED" | "DECLINED";
  review?: string;
  reviewerId?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface ReconciliationRequest {
  id: string;
  traineeUserId: string;
  recordRef: string;
  reason: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
}

export interface Feedback {
  id: string;
  traineeUserId: string;
  authorId: string;
  text: string;
  version: number;
  createdAt: string;
}

export type ReportPeriodType = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "FULL";

/** Every save of a report copy is a version (FR-RPT-04). Only versions with `publishedAt` are visible to the user. */
export interface ReportVersion {
  version: string;
  sections: Record<string, string>;
  savedBy: string;
  savedAt: string;
  publishedBy?: string;
  publishedAt?: string;
}

export interface Report {
  id: string;
  traineeUserId: string;
  periodType: ReportPeriodType;
  periodStart: string;
  periodEnd: string;
  sections: Record<string, string>; // editable PM text for this trainee + period only
  notes: { text: string; at: string }[];
  versions: ReportVersion[];
}

export interface EmailDelivery {
  id: string;
  reportId?: string; // report emails
  taskId?: string; // task-owner verification emails
  userId?: string; // account-created emails (FR-AUTH-08); the temporary password is never stored here
  recipient: string;
  subject: string;
  status: "QUEUED" | "ACCEPTED" | "FAILED";
  attempts: number;
  createdAt: string;
}

export type XpStatus = "PENDING" | "AWARDED" | "HELD" | "REJECTED" | "REVERSED";

export interface XpEvent {
  id: string;
  traineeUserId: string;
  source: string;
  amount: number;
  status: XpStatus;
  key: string;
  evidence: string;
  reason?: string;
  flag?: string;
  date: string;
}

export interface XpRules {
  verifiedModule: number;
  verifiedModuleDailyCap: number;
  onTimeSprint: number;
  finalAssessment: number;
  kudos: number;
  kudosSendLimitPerWeek: number;
  kudosCooldownDays: number;
  kudosReceivedCapPerWeek: number;
  streakMilestone: number;
  pmReviewMultiplier: number;
  engagementDropAlertPct: number;
  sprintCutoff: string;
}

export interface Level {
  name: string;
  minXp: number;
}

export interface Quest {
  id: string;
  name: string;
  description: string;
  target: number;
  reward: number;
  start: string;
  end: string;
}

export interface QuestProgress {
  questId: string;
  traineeUserId: string;
  count: number;
  verifiedBy?: string;
}

/** Automatic badge rules (FR-GAM-06). A badge without a rule is MANUAL: a PM awards it. */
export type BadgeRuleType = "ON_TIME_SPRINT_STREAK" | "SPRINT_STREAK" | "KUDOS_DISTINCT_SENDERS";

export interface Badge {
  id: string;
  name: string;
  icon: string;
  criteria: string;
  rule?: { type: BadgeRuleType; threshold: number };
  /** A retired badge is no longer awarded. Awards already given stay. */
  retiredAt?: string;
}

/** A user earns a badge once. A revoked award is kept and the badge is never awarded to that user again. */
export interface BadgeAward {
  badgeId: string;
  traineeUserId: string;
  evidence: string;
  source: "AUTOMATIC" | "MANUAL";
  /** Empty for an automatic award: no PM awarded it. */
  awardedBy?: string;
  awardedAt: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

export interface Kudos {
  id: string;
  fromId: string;
  toId: string;
  category: "Helpful" | "Great explanation" | "Teamwork";
  message: string;
  date: string;
  suspicious: boolean;
}

export interface StreakFreeze {
  traineeUserId: string;
  date: string;
  source: "LEAVE" | "HOLIDAY";
  reason: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  /** Set on retake-request notifications: clicking one opens the approval pop-up instead of a page. */
  requestId?: string;
  createdAt: string;
  readAt?: string;
}

export interface NotificationPreference {
  userId: string;
  category: string;
  /** Ticked = notifications of this category appear in the bell. A missing value counts as ticked. */
  showInBell: boolean;
}

export type IntegrationKey = "ERP" | "TEAMS" | "YOUTUBE" | "AI" | "EMAIL" | "ROADMAP";
export type IntegrationStatusValue =
  | "Disconnected"
  | "Authorization required"
  | "Failed — retry available"
  | "Stale cached data"
  | "Connected";

export interface Integration {
  key: IntegrationKey;
  name: string;
  status: IntegrationStatusValue;
  lastSync?: string;
}

/**
 * A user asks the PM for permission to retake the skill assessment. The PM sets the time and total
 * marks when approving. One approval allows one retake: it becomes USED when the retake is submitted.
 */
export interface RetakeRequest {
  id: string;
  traineeUserId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "USED";
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  /** Set on approval. */
  minutes?: number;
  totalMarks?: number;
}

/** One row per sector per month: average skill score (0-100) of that sector, written by a monthly job. */
export interface SectorSnapshot {
  month: string; // YYYY-MM
  sector: Sector;
  avgScore: number;
}

export interface DB {
  version: number;
  users: User[];
  trainees: Trainee[];
  teams: Team[];
  sessions: Session[];
  evaluations: ExpertiseEvaluation[];
  courses: Course[];
  suggestionApprovals: SuggestionApproval[];
  assignments: Assignment[];
  courseRequests: CourseRequest[];
  topicStates: TopicState[];
  subtopicProgress: SubtopicProgress[];
  questionSets: QuestionSet[];
  attempts: Attempt[];
  appeals: Appeal[];
  sprintTasks: SprintTask[];
  sprintSubmissions: SprintSubmission[];
  sprintWeeks: SprintWeek[];
  dsCells: DSCell[];
  dsMeetings: DSMeeting[];
  taskOwners: TaskOwner[];
  attendance: AttendanceRecord[];
  meetingAttendance: MeetingAttendance[];
  leaveRequests: LeaveRequest[];
  reconciliations: ReconciliationRequest[];
  feedback: Feedback[];
  reports: Report[];
  emailDeliveries: EmailDelivery[];
  xpEvents: XpEvent[];
  xpRules: XpRules;
  levels: Level[];
  quests: Quest[];
  questProgress: QuestProgress[];
  badges: Badge[];
  badgeAwards: BadgeAward[];
  kudos: Kudos[];
  streakFreezes: StreakFreeze[];
  notifications: Notification[];
  notificationPrefs: NotificationPreference[];
  integrations: Integration[];
  /** Public holidays (FR-ATT-08 step 1). Empty until a source provides them. */
  publicHolidays: { date: string; name: string }[];
  sectorSnapshots: SectorSnapshot[];
  retakeRequests: RetakeRequest[];
  currentUserId: string | null;
  currentSessionId: string | null;
}
