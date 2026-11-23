import { Injectable } from '@nestjs/common';
import type {
  ReportDailyLatePoint,
  ReportEvidenceLine,
  ReportSectionData,
  ReportSourceStatus,
  ReportVisualSummary,
} from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toIsoDate } from './reports.validation.js';

const UNAVAILABLE_TEXT = 'Data unavailable for this period';

export interface AggregatedReportEvidence {
  sections: ReportSectionData[];
  visualSummary: ReportVisualSummary;
}

@Injectable()
export class ReportsAggregator {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only cross-module aggregation for the 7 fixed report sections and
   * ReportVisualSummary. Never writes to any other module's tables.
   */
  async buildEvidence(params: {
    workspaceId: string;
    userId: string;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<AggregatedReportEvidence> {
    const { workspaceId, userId, periodStart, periodEnd } = params;
    const periodEndInclusive = new Date(periodEnd.getTime());
    periodEndInclusive.setUTCHours(23, 59, 59, 999);

    const [
      integrations,
      latestExpertise,
      assignments,
      lessonProgresses,
      topicStates,
      attempts,
      feedbackVersions,
      attendances,
      meetingAttendances,
      approvedLeaves,
      xpEvents,
      streak,
      badgeAwards,
      sprintSubmissions,
      sprintTasks,
    ] = await Promise.all([
      this.prisma.integration.findMany({ where: { workspaceId } }),
      this.prisma.expertiseVersion.findFirst({
        where: { workspaceId, userId, status: 'SUBMITTED' },
        orderBy: { version: 'desc' },
        include: {
          expertiseTechnologyResults: { include: { skill: true } },
          proctoringViolations: true,
        },
      }),
      this.prisma.courseAssignment.findMany({
        where: { workspaceId, userId },
        include: {
          course: {
            include: {
              modules: {
                include: { lessons: { select: { id: true } } },
              },
            },
          },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { workspaceId, userId },
        select: { lessonId: true },
      }),
      this.prisma.learnerTopicState.findMany({
        where: { workspaceId, userId },
        select: { moduleId: true, state: true },
      }),
      this.prisma.attempt.findMany({
        where: {
          workspaceId,
          userId,
          submittedAt: { gte: periodStart, lte: periodEndInclusive },
        },
        include: {
          integrityEvents: true,
          appeals: true,
        },
      }),
      this.prisma.feedbackVersion.findMany({
        where: {
          workspaceId,
          userId,
          createdAt: { gte: periodStart, lte: periodEndInclusive },
        },
        orderBy: { version: 'desc' },
        include: { author: { select: { name: true } } },
      }),
      this.prisma.attendance.findMany({
        where: {
          workspaceId,
          userId,
          date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.meetingAttendance.findMany({
        where: {
          workspaceId,
          userId,
          scheduledStart: { gte: periodStart, lte: periodEndInclusive },
        },
        orderBy: { scheduledStart: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          workspaceId,
          userId,
          status: 'APPROVED',
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
      }),
      this.prisma.xpEvent.findMany({
        where: {
          workspaceId,
          userId,
          status: 'AWARDED',
          occurredOn: { gte: periodStart, lte: periodEnd },
        },
      }),
      this.prisma.streak.findUnique({ where: { userId } }),
      this.prisma.badgeAward.findMany({
        where: {
          workspaceId,
          userId,
          revokedAt: null,
          awardedAt: { gte: periodStart, lte: periodEndInclusive },
        },
        include: { badge: { select: { name: true } } },
      }),
      this.prisma.sprintSubmission.findMany({
        where: {
          workspaceId,
          userId,
          date: { gte: periodStart, lte: periodEnd },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.sprintTask.findMany({
        where: {
          workspaceId,
          userId,
          deletedAt: null,
          date: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    const integrationMap = new Map(integrations.map((i) => [i.key, i.status]));
    const erpSource: ReportSourceStatus =
      integrationMap.get('ERP') === 'CONNECTED' ? 'connected' : 'sample';
    const teamsSource: ReportSourceStatus =
      integrationMap.get('TEAMS') === 'CONNECTED' ? 'connected' : 'sample';

    // 1. Skill analysis result
    const skillLines: ReportEvidenceLine[] = latestExpertise
      ? [
          {
            label: 'Latest skill report',
            value: `v${latestExpertise.version} · ${latestExpertise.level ?? 'Assessed'} (${latestExpertise.score ?? 0}/${latestExpertise.total ?? 0})`,
            source: integrationMap.get('AI') === 'CONNECTED' ? 'connected' : 'sample',
          },
          {
            label: 'Technologies assessed',
            value:
              latestExpertise.expertiseTechnologyResults.length > 0
                ? latestExpertise.expertiseTechnologyResults
                    .map((r) => `${r.skill.name}: ${r.status}`)
                    .join(', ')
                : UNAVAILABLE_TEXT,
            source:
              latestExpertise.expertiseTechnologyResults.length > 0
                ? integrationMap.get('AI') === 'CONNECTED'
                  ? 'connected'
                  : 'sample'
                : 'unavailable',
          },
        ]
      : [
          {
            label: 'Skill analysis',
            value: UNAVAILABLE_TEXT,
            source: 'unavailable',
          },
        ];

    // 2. Courses result (content completion vs verified mastery kept separate)
    const completedLessonIds = new Set(lessonProgresses.map((l) => l.lessonId));
    const masteredModuleIds = new Set(
      topicStates.filter((t) => t.state === 'MASTERED').map((t) => t.moduleId),
    );
    let totalLessons = 0;
    let completedLessons = 0;
    let totalModules = 0;
    let masteredModules = 0;
    for (const a of assignments) {
      for (const m of a.course.modules) {
        totalModules += 1;
        if (masteredModuleIds.has(m.id)) masteredModules += 1;
        for (const lesson of m.lessons) {
          totalLessons += 1;
          if (completedLessonIds.has(lesson.id)) completedLessons += 1;
        }
      }
    }
    const contentCompletionPct =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    const verifiedMasteryPct =
      totalModules > 0 ? Math.round((masteredModules / totalModules) * 100) : 0;

    const finalAttempts = attempts.filter((a) => a.status === 'FINAL');
    const scoredValues = attempts
      .map((a) => {
        if (a.finalScore !== null) return a.finalScore;
        return a.objectiveTotal > 0 ? Math.round((a.objectiveScore / a.objectiveTotal) * 100) : null;
      })
      .filter((v): v is number => v !== null);
    const assessmentAveragePct =
      scoredValues.length > 0
        ? Math.round(scoredValues.reduce((sum, v) => sum + v, 0) / scoredValues.length)
        : null;

    const courseLines: ReportEvidenceLine[] =
      assignments.length > 0
        ? [
            {
              label: 'Assigned courses',
              value: `${assignments.length} course(s)`,
              source: 'connected',
            },
            {
              label: 'Content completion',
              value: `${contentCompletionPct}% (${completedLessons}/${totalLessons} lessons)`,
              source: 'connected',
            },
            {
              label: 'Verified mastery',
              value: `${verifiedMasteryPct}% (${masteredModules}/${totalModules} topics)`,
              source: 'PM-entered',
            },
            {
              label: 'Course assessments in period',
              value:
                attempts.length > 0
                  ? `${attempts.length} attempt(s), ${finalAttempts.length} final${assessmentAveragePct !== null ? `, avg ${assessmentAveragePct}%` : ''}`
                  : UNAVAILABLE_TEXT,
              source: attempts.length > 0 ? 'connected' : 'unavailable',
            },
          ]
        : [
            {
              label: 'Assigned courses',
              value: UNAVAILABLE_TEXT,
              source: 'unavailable',
            },
          ];

    // 3. Proctoring result
    const skillViolations = latestExpertise?.proctoringViolations.length ?? 0;
    const attemptIntegrityCount = attempts.reduce((sum, a) => sum + a.integrityEvents.length, 0);
    const openAppeals = attempts.reduce(
      (sum, a) => sum + a.appeals.filter((ap) => ap.status === 'OPEN').length,
      0,
    );
    const hasProctoringData = latestExpertise !== null || attempts.length > 0;
    const proctoringLines: ReportEvidenceLine[] = hasProctoringData
      ? [
          {
            label: 'Skill quiz proctoring warnings',
            value: `${skillViolations}`,
            source: 'connected',
            note: 'Review signals, not proof.',
          },
          {
            label: 'Course assessment integrity events',
            value: `${attemptIntegrityCount}`,
            source: 'connected',
            note: 'Review signals, not proof.',
          },
          {
            label: 'Open assessment appeals',
            value: `${openAppeals}`,
            source: 'connected',
          },
        ]
      : [
          {
            label: 'Proctoring',
            value: UNAVAILABLE_TEXT,
            source: 'unavailable',
          },
        ];

    // 4. L&D feedback
    const latestFeedback = feedbackVersions[0] ?? null;
    const feedbackLines: ReportEvidenceLine[] = latestFeedback
      ? [
          {
            label: `Latest L&D feedback (v${latestFeedback.version})`,
            value: latestFeedback.text,
            source: 'PM-entered',
            note: `By ${latestFeedback.author.name}`,
          },
        ]
      : [
          {
            label: 'L&D feedback',
            value: UNAVAILABLE_TEXT,
            source: 'unavailable',
          },
        ];

    // 5. Attendance (missing ERP data or REPORT_PENDING is NEVER counted as absence)
    const manualCount = attendances.filter((a) => a.source === 'PM_ENTERED').length;
    const lateCount = attendances.filter((a) => a.lateMinutes > 0).length;
    const pendingMeetings = meetingAttendances.filter((m) => m.status === 'REPORT_PENDING').length;
    const attendedMeetings = meetingAttendances.filter((m) => m.status === 'ATTENDED').length;

    const attendanceLines: ReportEvidenceLine[] = [
      {
        label: 'Office attendance records',
        value:
          attendances.length > 0
            ? `${attendances.length} day(s) recorded, ${lateCount} late${manualCount > 0 ? ` (${manualCount} PM-entered)` : ''}`
            : UNAVAILABLE_TEXT,
        source:
          attendances.length === 0
            ? 'unavailable'
            : manualCount === attendances.length
              ? 'PM-entered'
              : erpSource,
        note: 'Missing ERP records are never counted as absence.',
      },
      {
        label: 'Approved leave in period',
        value: `${approvedLeaves.length} request(s)`,
        source: 'PM-entered',
      },
      {
        label: 'Teams meetings',
        value:
          meetingAttendances.length > 0
            ? `${attendedMeetings} attended${pendingMeetings > 0 ? `, ${pendingMeetings} report pending (not absence)` : ''}`
            : UNAVAILABLE_TEXT,
        source: meetingAttendances.length > 0 ? teamsSource : 'unavailable',
      },
    ];

    // 6. Gamification (engagement only, never a performance rating; AWARDED XP only)
    const awardedXpInPeriod = xpEvents.reduce((sum, e) => sum + e.amount, 0);
    const gamificationLines: ReportEvidenceLine[] = [
      {
        label: 'Awarded XP in period (engagement only, not a performance rating)',
        value: `${awardedXpInPeriod} XP`,
        source: 'connected',
        note: 'Pending and held XP is excluded.',
      },
      {
        label: 'Current sprint streak',
        value: streak ? `${streak.current} day(s) (longest ${streak.longest})` : '0 day(s)',
        source: 'connected',
      },
      {
        label: 'Badges earned in period',
        value:
          badgeAwards.length > 0
            ? badgeAwards.map((b) => b.badge.name).join(', ')
            : 'None in this period',
        source: 'PM-entered',
      },
    ];

    // 7. Sprint
    const onTimeSprints = sprintSubmissions.filter((s) => s.onTime).length;
    const sprintOnTimeRatePct =
      sprintSubmissions.length > 0
        ? Math.round((onTimeSprints / sprintSubmissions.length) * 100)
        : null;
    const completedTasks = sprintTasks.filter((t) => t.done).length;
    const totalActualHours = sprintTasks.reduce((sum, t) => sum + Number(t.actualHours), 0);
    const blockersCount = sprintTasks.filter((t) => t.blocker.trim().length > 0).length;

    const sprintLines: ReportEvidenceLine[] =
      sprintSubmissions.length > 0 || sprintTasks.length > 0
        ? [
            {
              label: 'Daily sprint submissions',
              value: `${sprintSubmissions.length} submitted (${onTimeSprints} on time${sprintOnTimeRatePct !== null ? `, ${sprintOnTimeRatePct}%` : ''})`,
              source: 'connected',
            },
            {
              label: 'Sprint tasks',
              value: `${completedTasks}/${sprintTasks.length} completed · ${totalActualHours.toFixed(1)}h logged`,
              source: 'connected',
            },
            {
              label: 'Blockers reported',
              value: `${blockersCount}`,
              source: 'connected',
            },
          ]
        : [
            {
              label: 'Daily sprint',
              value: UNAVAILABLE_TEXT,
              source: 'unavailable',
            },
          ];

    const sections: ReportSectionData[] = [
      { name: 'Skill analysis result', lines: skillLines, pmNote: '' },
      { name: 'Courses result', lines: courseLines, pmNote: '' },
      { name: 'Proctoring result', lines: proctoringLines, pmNote: '' },
      { name: 'L&D feedback', lines: feedbackLines, pmNote: '' },
      { name: 'Attendance', lines: attendanceLines, pmNote: '' },
      { name: 'Gamification', lines: gamificationLines, pmNote: '' },
      { name: 'Sprint', lines: sprintLines, pmNote: '' },
    ];

    const officeLateMinutes: ReportDailyLatePoint[] = attendances.map((a) => ({
      date: toIsoDate(a.date),
      lateMinutes: a.lateMinutes,
    }));

    const meetingLateMinutes: ReportDailyLatePoint[] = meetingAttendances.map((m) => ({
      date: toIsoDate(m.scheduledStart),
      lateMinutes: m.status === 'ATTENDED' ? (m.lateMinutes ?? 0) : null,
    }));

    return {
      sections,
      visualSummary: {
        contentCompletionPct,
        verifiedMasteryPct,
        assessmentAveragePct,
        finalResultsCount: finalAttempts.length,
        sprintOnTimeRatePct,
        officeLateMinutes,
        meetingLateMinutes,
      },
    };
  }
}
