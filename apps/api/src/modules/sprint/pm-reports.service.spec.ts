import { SprintError } from './errors.js';
import { PmReportsService } from './pm-reports.service.js';
import type { SprintRepository } from './sprint.repository.js';
import type { SprintActor } from './http/actor.js';

/**
 * The rules of the PM's sprint report (P6, FR-DS-07, US-69).
 *
 * The rules under test:
 * - **the caller is the PM who signed in**: a user is 403 `FORBIDDEN`,
 * - **the scope**: a PM sees the users they manage (`User.pmId === pmId`), and a team report
 *   covers the members of that team **that the PM manages** (ASSUMPTIONS D8),
 * - a team of another PM is 403 `FORBIDDEN_SCOPE` and **nothing is read** (PRD BR-08),
 * - **the window**: daily, the Monday-to-Sunday sprint week, the two weeks ending with it,
 *   and the calendar month (ASSUMPTIONS OQ-13, L1),
 * - **a missing value is never a zero** (PRD NFR-09, ASSUMPTIONS E8): no rows means
 *   `MISSING`, rows that sum to zero mean a real zero,
 * - a **deleted** task is never in a report (ASSUMPTIONS D9),
 * - an **archived** user is not in a report, and a member who left **before** the window is
 *   out while one who left **inside** it stays (ASSUMPTIONS L8).
 */

const PM: SprintActor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };
const USER: SprintActor = { role: 'TRAINEE', userId: 'BS23001', workspaceId: 'w1' };

/** A team of PM001. */
const team = (overrides: Record<string, unknown> = {}) => ({
  id: 'team-1',
  name: 'Team A',
  pmId: 'PM001',
  archivedAt: null,
  ...overrides,
});

/** A user of PM001. */
const reportUser = (overrides: Record<string, unknown> = {}) => ({
  userId: 'BS23001',
  name: 'A User',
  ...overrides,
});

/** A membership of a team, with the member's own PM and archive state. */
const membership = (overrides: Record<string, unknown> = {}) => ({
  userId: 'BS23001',
  leftAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  user: { userId: 'BS23001', name: 'A User', pmId: 'PM001', archivedAt: null },
  ...overrides,
});

/** A task of a user. */
const task = (overrides: Record<string, unknown> = {}) => ({
  userId: 'BS23001',
  date: new Date('2026-11-23T00:00:00Z'),
  plannedHours: 4,
  actualHours: 3,
  blocker: '',
  ...overrides,
});

/** A submission of a user. */
const submission = (overrides: Record<string, unknown> = {}) => ({
  userId: 'BS23001',
  date: new Date('2026-11-23T00:00:00Z'),
  onTime: true,
  ...overrides,
});

const makeRepository = () => ({
  findTeam: vi.fn<(args: unknown) => Promise<unknown>>(),
  findReportUsers: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findReportTeamUsers: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findReportTasks: vi.fn<
    (workspaceId: string, userIds: string[], from: Date, to: Date) => Promise<unknown[]>
  >(),
  findReportSubmissions: vi.fn<
    (workspaceId: string, userIds: string[], from: Date, to: Date) => Promise<unknown[]>
  >(),
});

const makeService = () => {
  const repository = makeRepository();
  repository.findTeam.mockResolvedValue(team());
  repository.findReportUsers.mockResolvedValue([reportUser()]);
  repository.findReportTeamUsers.mockResolvedValue([membership()]);
  repository.findReportTasks.mockResolvedValue([task()]);
  repository.findReportSubmissions.mockResolvedValue([submission()]);

  const service = new PmReportsService(repository as unknown as SprintRepository);
  return { service, repository };
};

/** The query for a report. */
const query = (overrides: Record<string, unknown> = {}) =>
  ({
    type: 'daily',
    date: '2026-11-23',
    ...overrides,
  }) as never;

describe('PmReportsService — who is allowed in', () => {
  it('refuses a user', async () => {
    const { service } = makeService();

    await expect(service.getReports(USER, query())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses a user before anything is read', async () => {
    const { service, repository } = makeService();

    await expect(service.getReports(USER, query())).rejects.toBeInstanceOf(SprintError);

    expect(repository.findReportUsers).not.toHaveBeenCalled();
    expect(repository.findReportTasks).not.toHaveBeenCalled();
    expect(repository.findReportSubmissions).not.toHaveBeenCalled();
  });

  it('reads nothing at all for a user, not even the team', async () => {
    const { service, repository } = makeService();

    await expect(
      service.getReports(USER, query({ teamId: 'team-1' })),
    ).rejects.toBeInstanceOf(SprintError);

    expect(repository.findTeam).not.toHaveBeenCalled();
  });
});

describe('PmReportsService — the scope', () => {
  it('refuses a team of another PM', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));

    await expect(
      service.getReports(PM, query({ teamId: 'team-1' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('refuses a team that does not exist, the same way', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(null);

    await expect(
      service.getReports(PM, query({ teamId: 'team-1' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('reads nothing when the scope check fails', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));

    await expect(service.getReports(PM, query({ teamId: 'team-1' }))).rejects.toBeInstanceOf(
      SprintError,
    );

    expect(repository.findReportTeamUsers).not.toHaveBeenCalled();
    expect(repository.findReportTasks).not.toHaveBeenCalled();
    expect(repository.findReportSubmissions).not.toHaveBeenCalled();
  });

  it('reads every query in the workspace of the caller', async () => {
    const { service, repository } = makeService();

    await service.getReports(PM, query());

    expect(repository.findReportUsers).toHaveBeenCalledWith('w1', 'PM001');
    const taskCall = repository.findReportTasks.mock.calls[0];
    expect(taskCall?.[0]).toBe('w1');
    const submissionCall = repository.findReportSubmissions.mock.calls[0];
    expect(submissionCall?.[0]).toBe('w1');
  });

  it('leaves out a member another PM manages', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      membership(),
      membership({
        userId: 'BS23004',
        user: { userId: 'BS23004', name: 'B User', pmId: 'PM002', archivedAt: null },
      }),
    ]);

    const report = await service.getReports(PM, query({ teamId: 'team-1' }));

    expect(report.rows.map((row) => row.userId)).toEqual(['BS23001']);
  });

  it('leaves out an archived member', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      membership({
        user: {
          userId: 'BS23002',
          name: 'C User',
          pmId: 'PM001',
          archivedAt: new Date('2026-11-01T00:00:00Z'),
        },
      }),
    ]);

    const report = await service.getReports(PM, query({ teamId: 'team-1' }));

    expect(report.rows).toHaveLength(0);
  });

  it('leaves out a member who left before the window', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      membership({ leftAt: new Date('2026-11-21T00:00:00Z') }),
    ]);

    const report = await service.getReports(
      PM,
      query({ teamId: 'team-1', type: 'weekly', date: '2026-11-23' }),
    );

    expect(report.rows).toHaveLength(0);
  });

  it('keeps a member who left inside the window', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      membership({ leftAt: new Date('2026-11-25T00:00:00Z') }),
    ]);

    const report = await service.getReports(
      PM,
      query({ teamId: 'team-1', type: 'weekly', date: '2026-11-23' }),
    );

    expect(report.rows.map((row) => row.userId)).toEqual(['BS23001']);
  });

  it('keeps a member who left on the first day of the window', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      // The first day of the report week of 2026-11-23 is Sunday 2026-11-22.
      membership({ leftAt: new Date('2026-11-22T00:00:00Z') }),
    ]);

    const report = await service.getReports(
      PM,
      query({ teamId: 'team-1', type: 'weekly', date: '2026-11-23' }),
    );

    expect(report.rows).toHaveLength(1);
  });

  it('leaves out a member who left the day before the window starts', async () => {
    const { service, repository } = makeService();
    repository.findReportTeamUsers.mockResolvedValue([
      membership({ leftAt: new Date('2026-11-21T00:00:00Z') }),
    ]);

    const report = await service.getReports(
      PM,
      query({ teamId: 'team-1', type: 'weekly', date: '2026-11-23' }),
    );

    expect(report.rows).toHaveLength(0);
  });
});

describe('PmReportsService — the window', () => {
  // The report week runs **Sunday through Friday**, with only Saturday off. The reference
  // days below are:
  //
  //   2026-11-15  Sunday      2026-11-20  Friday
  //   2026-11-16  Monday      2026-11-21  Saturday
  //   2026-11-22  Sunday      2026-11-27  Friday
  //   2026-11-23  Monday      2026-11-28  Saturday
  //                            2026-11-29  Sunday

  it('covers the day itself for a daily report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'daily', date: '2026-11-23' }));

    expect(report.from).toBe('2026-11-23');
    expect(report.to).toBe('2026-11-23');
  });

  it('covers Sunday through Friday for a weekly report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-23' }));

    expect(report.from).toBe('2026-11-22');
    expect(report.to).toBe('2026-11-27');
  });

  it('starts the weekly report on the Sunday of a day in the middle of the week', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-26' }));

    expect(report.from).toBe('2026-11-22');
    expect(report.to).toBe('2026-11-27');
  });

  it('starts the weekly report on the Sunday itself', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-22' }));

    expect(report.from).toBe('2026-11-22');
    expect(report.to).toBe('2026-11-27');
  });

  it('ends the weekly report on the Friday, not on the Saturday', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-23' }));

    // 2026-11-28 is a Saturday: the one off day of the report week.
    expect(report.to).toBe('2026-11-27');
    expect(report.to).not.toBe('2026-11-28');
  });

  it('puts a Saturday in the week that started the day before it', async () => {
    const { service } = makeService();

    // 2026-11-21 is a Saturday. It belongs to the week that started on Sunday 2026-11-15,
    // so the report about it is the week of the 15th, not the week of the 22nd.
    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-21' }));

    expect(report.from).toBe('2026-11-15');
    expect(report.to).toBe('2026-11-20');
  });

  it('covers the two report weeks ending with that week for a biweekly report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'biweekly', date: '2026-11-23' }));

    // The week of 2026-11-22 and the week of 2026-11-15 before it.
    expect(report.from).toBe('2026-11-15');
    expect(report.to).toBe('2026-11-27');
  });

  it('covers the previous report week and this one for a biweekly report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'biweekly', date: '2026-11-26' }));

    expect(report.from).toBe('2026-11-15');
    expect(report.to).toBe('2026-11-27');
  });

  it('skips a month boundary for a biweekly report', async () => {
    const { service } = makeService();

    // 2026-12-06 is a Sunday, so its report week runs 2026-12-06 to 2026-12-11 and the
    // report week before it runs 2026-11-29 to 2026-12-04.
    const report = await service.getReports(PM, query({ type: 'biweekly', date: '2026-12-06' }));

    expect(report.from).toBe('2026-11-29');
    expect(report.to).toBe('2026-12-11');
  });

  it('covers the calendar month for a monthly report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'monthly', date: '2026-11-23' }));

    expect(report.from).toBe('2026-11-01');
    expect(report.to).toBe('2026-11-30');
  });

  it('ends the monthly report of February in a leap year on the 29th', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'monthly', date: '2028-02-10' }));

    expect(report.from).toBe('2028-02-01');
    expect(report.to).toBe('2028-02-29');
  });

  it('ends the monthly report of February in a normal year on the 28th', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'monthly', date: '2026-02-10' }));

    expect(report.to).toBe('2026-02-28');
  });

  it('covers December of a monthly report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'monthly', date: '2026-12-15' }));

    expect(report.from).toBe('2026-12-01');
    expect(report.to).toBe('2026-12-31');
  });

  it('asks the repository for exactly the days of the window', async () => {
    const { service, repository } = makeService();

    await service.getReports(PM, query({ type: 'weekly', date: '2026-11-23' }));

    const call = repository.findReportTasks.mock.calls[0];
    expect(call?.[2]).toEqual(new Date('2026-11-22T00:00:00Z'));
    expect(call?.[3]).toEqual(new Date('2026-11-27T00:00:00Z'));
  });

  it('asks the repository for the two weeks of a biweekly report', async () => {
    const { service, repository } = makeService();

    await service.getReports(PM, query({ type: 'biweekly', date: '2026-11-23' }));

    const call = repository.findReportTasks.mock.calls[0];
    expect(call?.[2]).toEqual(new Date('2026-11-15T00:00:00Z'));
    expect(call?.[3]).toEqual(new Date('2026-11-27T00:00:00Z'));
  });

  it('nests the windows: daily inside weekly inside biweekly', async () => {
    const { service } = makeService();

    const daily = await service.getReports(PM, query({ type: 'daily', date: '2026-11-23' }));
    const weekly = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-23' }));
    const biweekly = await service.getReports(PM, query({ type: 'biweekly', date: '2026-11-23' }));

    expect(daily.from >= weekly.from && daily.to <= weekly.to).toBe(true);
    expect(weekly.from >= biweekly.from && weekly.to <= biweekly.to).toBe(true);
  });
});

describe('PmReportsService — the figures', () => {
  it('sums the planned and the actual hours of the tasks', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([
      task({ plannedHours: 4, actualHours: 3 }),
      task({ plannedHours: 2.5, actualHours: 1.5 }),
    ]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.plannedHours).toEqual({ value: 6.5, source: 'TASK' });
    expect(report.rows[0]?.actualHours).toEqual({ value: 4.5, source: 'TASK' });
  });

  it('counts the tasks', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([task(), task()]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.taskCount).toEqual({ value: 2, source: 'TASK' });
  });

  it('counts the submitted days and the on-time days', async () => {
    const { service, repository } = makeService();
    repository.findReportSubmissions.mockResolvedValue([
      submission({ onTime: true }),
      submission({ onTime: false }),
      submission({ onTime: true }),
    ]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.submittedDays).toEqual({ value: 3, source: 'SUBMISSION' });
    expect(report.rows[0]?.onTimeDays).toEqual({ value: 2, source: 'SUBMISSION' });
  });

  it('shows a missing figure as missing, never as a zero', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([]);
    repository.findReportSubmissions.mockResolvedValue([]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.plannedHours).toEqual({ value: null, source: 'MISSING' });
    expect(report.rows[0]?.actualHours).toEqual({ value: null, source: 'MISSING' });
    expect(report.rows[0]?.taskCount).toEqual({ value: null, source: 'MISSING' });
    expect(report.rows[0]?.submittedDays).toEqual({ value: null, source: 'MISSING' });
    expect(report.rows[0]?.onTimeDays).toEqual({ value: null, source: 'MISSING' });
  });

  it('shows a task worth zero hours as a real zero, not as missing', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([task({ plannedHours: 0, actualHours: 0 })]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.plannedHours).toEqual({ value: 0, source: 'TASK' });
    expect(report.rows[0]?.actualHours).toEqual({ value: 0, source: 'TASK' });
  });

  it('shows a user who submitted late as a real zero on-time days', async () => {
    const { service, repository } = makeService();
    repository.findReportSubmissions.mockResolvedValue([submission({ onTime: false })]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.submittedDays).toEqual({ value: 1, source: 'SUBMISSION' });
    expect(report.rows[0]?.onTimeDays).toEqual({ value: 0, source: 'SUBMISSION' });
  });

  it('lists the blockers of the tasks in the window', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([
      task({ blocker: 'Waiting for the API key' }),
      task({ blocker: '' }),
      task({ blocker: '   ' }),
      task({ blocker: '  Database is down  ' }),
    ]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.blockers).toEqual(['Waiting for the API key', 'Database is down']);
  });

  it('answers an empty blocker list when there were no blockers', async () => {
    const { service, repository } = makeService();
    repository.findReportTasks.mockResolvedValue([task({ blocker: '' })]);

    const report = await service.getReports(PM, query());

    expect(report.rows[0]?.blockers).toEqual([]);
  });

  it('keeps each user on their own row', async () => {
    const { service, repository } = makeService();
    repository.findReportUsers.mockResolvedValue([
      reportUser({ userId: 'BS23001', name: 'A User' }),
      reportUser({ userId: 'BS23002', name: 'B User' }),
    ]);
    repository.findReportTasks.mockResolvedValue([
      task({ userId: 'BS23001', plannedHours: 4, actualHours: 4 }),
      task({ userId: 'BS23002', plannedHours: 1, actualHours: 1 }),
    ]);
    repository.findReportSubmissions.mockResolvedValue([
      submission({ userId: 'BS23001' }),
      submission({ userId: 'BS23002' }),
    ]);

    const report = await service.getReports(PM, query());

    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({
      userId: 'BS23001',
      name: 'A User',
      plannedHours: { value: 4 },
    });
    expect(report.rows[1]).toMatchObject({
      userId: 'BS23002',
      name: 'B User',
      plannedHours: { value: 1 },
    });
  });

  it('does not ask the database about the tasks of a user that is not in the scope', async () => {
    const { service, repository } = makeService();
    repository.findReportUsers.mockResolvedValue([reportUser({ userId: 'BS23001' })]);

    await service.getReports(PM, query());

    const call = repository.findReportTasks.mock.calls[0];
    expect(call?.[1]).toEqual(['BS23001']);
  });

  it('asks for nothing when the scope is empty', async () => {
    const { service, repository } = makeService();
    repository.findReportUsers.mockResolvedValue([]);

    const report = await service.getReports(PM, query());

    expect(report.rows).toEqual([]);
    expect(repository.findReportTasks).not.toHaveBeenCalled();
    expect(repository.findReportSubmissions).not.toHaveBeenCalled();
  });
});

describe('PmReportsService — the shape of the answer', () => {
  it('answers the type, the day and the window it covered', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ type: 'weekly', date: '2026-11-23' }));

    expect(report.type).toBe('weekly');
    expect(report.date).toBe('2026-11-23');
    expect(report.from).toBe('2026-11-22');
    expect(report.to).toBe('2026-11-27');
  });

  it('answers null for the team of a report that covers every team', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query());

    expect(report.teamId).toBeNull();
  });

  it('answers the team of a team report', async () => {
    const { service } = makeService();

    const report = await service.getReports(PM, query({ teamId: 'team-1' }));

    expect(report.teamId).toBe('team-1');
  });
});
