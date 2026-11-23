import type {
  PmReportResponse,
  TraineePublishedReportDetail,
  TraineePublishedReportItem,
} from './types';

export const MOCK_PM_REPORT: PmReportResponse = {
  report: {
    id: 'mock-report-1',
    userId: 'BS23001',
    periodType: 'WEEKLY',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-07',
    updatedAt: new Date().toISOString(),
  },
  user: {
    userId: 'BS23001',
    name: 'Demo Trainee',
    onboardDate: '2026-11-01',
    departureDate: '2027-01-31',
    archivedAt: null,
  },
  period: {
    periodType: 'WEEKLY',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-07',
    inTrainingPeriod: true,
    outsidePeriodReason: null,
  },
  visualSummary: {
    contentCompletionPct: 65,
    verifiedMasteryPct: 50,
    assessmentAveragePct: 82,
    finalResultsCount: 3,
    sprintOnTimeRatePct: 90,
    officeLateMinutes: [0, 10, 0, 0, 15],
    meetingLateMinutes: [0, 5, 0],
  },
  liveSections: [
    {
      name: 'Skill analysis result',
      lines: [
        { label: 'Initial Evaluation Score', value: '78%', source: 'connected' },
        { label: 'Primary Tech Priority', value: 'TypeScript, NestJS', source: 'connected' },
      ],
      pmNote: 'Good initial foundation in backend architecture.',
    },
    {
      name: 'Courses result',
      lines: [
        { label: 'Completed Modules', value: '4 of 6 modules completed', source: 'connected' },
        { label: 'Quiz Average', value: '85%', source: 'connected' },
      ],
      pmNote: 'Consistently completes course modules before deadlines.',
    },
    {
      name: 'Proctoring result',
      lines: [
        { label: 'Proctored Assessments', value: '2 exams taken', source: 'connected' },
        { label: 'Integrity Violations', value: '0 violations flagged', source: 'connected' },
      ],
      pmNote: '',
    },
    {
      name: 'L&D feedback',
      lines: [
        { label: 'Reviewer', value: 'Central L&D Team', source: 'PM-entered' },
        { label: 'Mid-term Rating', value: 'Exceeding expectations', source: 'PM-entered' },
      ],
      pmNote: 'Very proactive in asking questions during office hours.',
    },
    {
      name: 'Attendance',
      lines: [
        {
          label: 'Office attendance records',
          value: '18 of 20 days present',
          source: 'connected',
          note: 'Missing ERP records are never counted as absence.',
        },
        { label: 'Approved Leave', value: '1 day approved', source: 'PM-entered' },
      ],
      pmNote: '',
    },
    {
      name: 'Gamification',
      lines: [
        {
          label: 'Awarded XP in period (engagement only, not a performance rating)',
          value: '350 XP',
          source: 'connected',
          note: 'Pending and held XP is excluded.',
        },
        { label: 'Current Sprint Streak', value: '8 days', source: 'connected' },
      ],
      pmNote: '',
    },
    {
      name: 'Sprint',
      lines: [
        { label: 'Task Submissions', value: '10 of 10 tasks delivered', source: 'connected' },
        { label: 'On-time Delivery Rate', value: '90%', source: 'connected' },
      ],
      pmNote: 'Fast turnaround on PR revisions.',
    },
  ],
  versions: [
    {
      id: 'mock-ver-1',
      version: '1.0',
      note: 'Initial approved evaluation',
      savedById: 'PM001',
      savedByName: 'Demo PM One',
      savedAt: '2026-11-08T10:00:00.000Z',
      publishedById: 'PM001',
      publishedByName: 'Demo PM One',
      publishedAt: '2026-11-08T12:00:00.000Z',
      sections: [],
    },
  ],
  mailDeliveries: [],
};

export const MOCK_TRAINEE_REPORTS: TraineePublishedReportItem[] = [
  {
    versionId: 'mock-ver-1',
    reportId: 'mock-report-1',
    version: '1.0',
    periodType: 'WEEKLY',
    periodStart: '2026-11-01',
    periodEnd: '2026-11-07',
    publishedById: 'PM001',
    publishedByName: 'Demo PM One',
    publishedAt: '2026-11-08T12:00:00.000Z',
  },
];

export const MOCK_TRAINEE_REPORT_DETAIL: TraineePublishedReportDetail = {
  versionId: 'mock-ver-1',
  reportId: 'mock-report-1',
  version: '1.0',
  periodType: 'WEEKLY',
  periodStart: '2026-11-01',
  periodEnd: '2026-11-07',
  publishedById: 'PM001',
  publishedByName: 'Demo PM One',
  publishedAt: '2026-11-08T12:00:00.000Z',
  sections: MOCK_PM_REPORT.liveSections,
  visualSummary: MOCK_PM_REPORT.visualSummary,
};
