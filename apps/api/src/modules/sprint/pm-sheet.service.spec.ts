import { SprintError } from './errors.js';
import { PmSheetService } from './pm-sheet.service.js';
import type { SprintRepository } from './sprint.repository.js';
import type { SprintActor } from './http/actor.js';
import type { ClockPort } from './time/clock.port.js';

/**
 * The rules of the PM's team sheet.
 *
 * The rules under test:
 * - a PM works only on **their own teams**; somebody else's team is 403 `FORBIDDEN_SCOPE`
 *   (PRD BR-08, SRS DS-06.5),
 * - a sprint week starts on **Monday**; any other day is 422 `WEEK_START_NOT_MONDAY`, and a
 *   second week for the same team and Monday is 409 `WEEK_EXISTS` (PRD BR-01),
 * - a cell is written **only while its version is the one the editor saw**; a cell somebody
 *   else changed in the meantime is 409 `CELL_CONFLICT` and is never overwritten
 *   (PRD BR-10, US-68),
 * - the sheet is **derived on read**, and a **stored edit wins** (ASSUMPTIONS OQ-1),
 * - `PLAN` is never derived: it is the PM's own note (ASSUMPTIONS OQ-2),
 * - a cell for somebody who is not a member of the week's team is 403 `FORBIDDEN_SCOPE`
 *   (ASSUMPTIONS E5).
 */

const PM: SprintActor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };
const OTHER_PM: SprintActor = { role: 'PM', pmId: 'PM002', workspaceId: 'w1' };
const USER: SprintActor = { role: 'TRAINEE', userId: 'BS23001', workspaceId: 'w1' };

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka. */
const NOW = new Date('2026-11-23T04:00:00Z');

/** A team of PM001. */
const team = (overrides: Record<string, unknown> = {}) => ({
  id: 'team-1',
  name: 'Team A',
  pmId: 'PM001',
  archivedAt: null,
  ...overrides,
});

/** A sprint week of that team, starting on Monday 2026-11-23. */
const week = (overrides: Record<string, unknown> = {}) => ({
  id: 'week-1',
  workspaceId: 'w1',
  teamId: 'team-1',
  weekStart: new Date('2026-11-23T00:00:00Z'),
  createdAt: new Date('2026-11-23T00:00:00Z'),
  updatedAt: new Date('2026-11-23T00:00:00Z'),
  team: { name: 'Team A', pmId: 'PM001' },
  ...overrides,
});

/** A membership of BS23001 in the team. */
const membership = (overrides: Record<string, unknown> = {}) => ({
  userId: 'BS23001',
  leftAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  user: { name: 'A User', archivedAt: null },
  ...overrides,
});

/** A task of BS23001 on a day. */
const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  userId: 'BS23001',
  date: new Date('2026-11-23T00:00:00Z'),
  title: 'Fix the login bug',
  plannedHours: 2,
  actualHours: 1,
  blocker: '',
  done: false,
  verification: null,
  ...overrides,
});

/** A stored cell of BS23001. */
const storedCell = (overrides: Record<string, unknown> = {}) => ({
  id: 'cell-1',
  weekId: 'week-1',
  userId: 'BS23001',
  date: new Date('2026-11-23T00:00:00Z'),
  column: 'PLAN',
  value: 'Finish the auth module',
  version: 3,
  authorPmId: 'PM001',
  authorUserId: null,
  updatedByPmId: 'PM001',
  updatedByUserId: null,
  createdAt: new Date('2026-11-23T00:00:00Z'),
  updatedAt: new Date('2026-11-23T00:00:00Z'),
  ...overrides,
});

const makeRepository = () => ({
  findTeam: vi.fn<(args: unknown) => Promise<unknown>>(),
  findSprintWeeks: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findSprintWeek: vi.fn<(args: unknown) => Promise<unknown>>(),
  findSprintWeekByStart: vi.fn<(args: unknown) => Promise<unknown>>(),
  createSprintWeek: vi.fn<(args: unknown) => Promise<unknown>>(),
  findTeamMembers: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findTasksForSheet: vi.fn<
    (workspaceId: string, userIds: string[], from: Date, to: Date) => Promise<unknown[]>
  >(),
  findSheetCells: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findSheetCell: vi.fn<(args: unknown) => Promise<unknown>>(),
  saveSheetCellIfVersion: vi.fn<
    (tx: unknown, cellId: string, expectedVersion: number, data: unknown) => Promise<unknown>
  >(),
  createSheetCell: vi.fn<(args: unknown) => Promise<unknown>>(),
  createSheetCellVersion: vi.fn<(args: unknown) => Promise<unknown>>(),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(),
});

const makeService = (options: { now?: Date } = {}) => {
  const repository = makeRepository();
  const clock: ClockPort = { now: () => options.now ?? NOW };
  const tx = {} as never;
  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work(tx),
  );

  const service = new PmSheetService(
    repository as unknown as SprintRepository,
    clock,
  );

  return { service, repository, tx };
};

describe('PmSheetService.listWeeks (P1)', () => {
  it('lists the weeks of a team of the PM', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeeks.mockResolvedValue([week()]);

    const weeks = await service.listWeeks(PM, 'team-1');

    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({
      id: 'week-1',
      teamId: 'team-1',
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
    });
  });

  it('answers 403 for a team of another PM', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));

    await expect(service.listWeeks(PM, 'team-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('answers 403 for a team that does not exist, so the caller cannot probe for teams', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(null);

    await expect(service.listWeeks(PM, 'team-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repository.findSprintWeeks).not.toHaveBeenCalled();
  });

  it('scopes the query to the caller\'s own workspace', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeeks.mockResolvedValue([]);

    await service.listWeeks(PM, 'team-1');

    expect(repository.findSprintWeeks).toHaveBeenCalledWith('w1', 'team-1');
  });

  it('refuses a user: the sheet is a PM page', async () => {
    const { service, repository } = makeService();

    await expect(service.listWeeks(USER, 'team-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repository.findTeam).not.toHaveBeenCalled();
  });
});

describe('PmSheetService.addSprintWeek (P2)', () => {
  it('adds a week that starts on a Monday', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeekByStart.mockResolvedValue(null);
    repository.createSprintWeek.mockResolvedValue(week());

    const created = await service.addSprintWeek(PM, 'team-1', '2026-11-23');

    expect(created.id).toBe('week-1');
    expect(created.weekStart).toBe('2026-11-23');
  });

  it('answers 422 when the week does not start on a Monday', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());

    // 2026-11-24 is a Tuesday.
    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-24')).rejects.toMatchObject({
      code: 'WEEK_START_NOT_MONDAY',
    });
    expect(repository.createSprintWeek).not.toHaveBeenCalled();
  });

  it('answers 422 for a Sunday, which is a working day but not a week start', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());

    // 2026-11-29 is a Sunday — the last day of a sprint week, never the first.
    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-29')).rejects.toMatchObject({
      code: 'WEEK_START_NOT_MONDAY',
    });
  });

  it('answers 409 when the team already has a week for that Monday', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeekByStart.mockResolvedValue({ id: 'week-1' });

    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-23')).rejects.toMatchObject({
      code: 'WEEK_EXISTS',
    });
    expect(repository.createSprintWeek).not.toHaveBeenCalled();
  });

  it('answers 409 when the unique index refuses a week somebody else added', async () => {
    // The check before the write passed, but another PM added the same week first.
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeekByStart.mockResolvedValue(null);
    repository.createSprintWeek.mockRejectedValue({ code: 'P2002' });

    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-23')).rejects.toMatchObject({
      code: 'WEEK_EXISTS',
    });
  });

  it('does not turn an unrelated database failure into a conflict', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeekByStart.mockResolvedValue(null);
    repository.createSprintWeek.mockRejectedValue(new Error('the database is on fire'));

    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-23')).rejects.toThrow(
      'the database is on fire',
    );
  });

  it('refuses a team of another PM', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));

    await expect(service.addSprintWeek(PM, 'team-1', '2026-11-23')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repository.createSprintWeek).not.toHaveBeenCalled();
  });

  it('writes the workspace of the caller, never one from the request', async () => {
    const { service, repository } = makeService();
    repository.findTeam.mockResolvedValue(team());
    repository.findSprintWeekByStart.mockResolvedValue(null);
    repository.createSprintWeek.mockResolvedValue(week());

    await service.addSprintWeek(PM, 'team-1', '2026-11-23');

    const call = repository.createSprintWeek.mock.calls[0];
    if (!call) throw new Error('the week was never written');
    expect(call[0]).toMatchObject({ workspaceId: 'w1', teamId: 'team-1' });
  });
});

describe('PmSheetService.getSheet (P3)', () => {
  it('answers with one row per member of the team', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]).toMatchObject({ userId: 'BS23001', name: 'A User' });
  });

  it('answers with seven days per row, Monday first', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    expect(sheet.rows[0].days.map((day) => day.date)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ]);
    // Friday and Saturday are the weekend; Sunday is a working day.
    expect(sheet.rows[0].days[4].weekend).toBe(true);
    expect(sheet.rows[0].days[5].weekend).toBe(true);
    expect(sheet.rows[0].days[6].weekend).toBe(false);
  });

  it('answers with the five columns in the order of the enum', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    expect(sheet.columns).toEqual(['YESTERDAY', 'HOURS', 'TODAY', 'BLOCKERS', 'PLAN']);
    expect(sheet.rows[0].days[0].cells.map((cell) => cell.column)).toEqual([
      'YESTERDAY',
      'HOURS',
      'TODAY',
      'BLOCKERS',
      'PLAN',
    ]);
  });

  it('derives the hours of a day from the tasks of that day', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([
      task({ plannedHours: 2, actualHours: 1 }),
      task({ id: 'task-2', plannedHours: 3, actualHours: 3 }),
    ]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const hours = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'HOURS');
    expect(hours?.value).toBe('planned 5 / actual 4');
    expect(hours?.source).toBe('DERIVED');
  });

  it('derives the today column from the titles of the day', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([task({ title: 'Fix the login bug' })]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const today = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'TODAY');
    expect(today?.value).toBe('Fix the login bug');
  });

  it('derives the yesterday column from the day before, not from the day itself', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([
      task({ date: new Date('2026-11-22T00:00:00Z'), title: 'Yesterday work' }),
      task({ id: 'task-2', date: new Date('2026-11-23T00:00:00Z'), title: 'Today work' }),
    ]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const yesterday = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'YESTERDAY');
    expect(yesterday?.value).toBe('Yesterday work');
  });

  it('derives the blockers from the blockers of the day', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([task({ blocker: 'Waiting for the API' })]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const blockers = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'BLOCKERS');
    expect(blockers?.value).toBe('Waiting for the API');
  });

  it('never derives the plan column: it is the PM\'s own note', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([task()]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const plan = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'PLAN');
    expect(plan?.value).toBe('');
    expect(plan?.source).toBe('EMPTY');
  });

  it('shows an empty cell for a day with nothing on it, never a zero', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const hours = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'HOURS');
    expect(hours?.value).toBe('');
    expect(hours?.source).toBe('EMPTY');
  });

  it('lets a stored edit win over the derived value', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([task()]);
    repository.findSheetCells.mockResolvedValue([storedCell({ column: 'TODAY', value: 'PM note' })]);

    const sheet = await service.getSheet(PM, 'week-1');

    const today = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'TODAY');
    expect(today?.value).toBe('PM note');
    expect(today?.source).toBe('STORED');
    expect(today?.version).toBe(3);
  });

  it('marks a cell whose task is still waiting for its owner', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([task({ verification: 'PENDING' })]);
    repository.findSheetCells.mockResolvedValue([]);

    const sheet = await service.getSheet(PM, 'week-1');

    const today = sheet.rows[0].days[0].cells.find((cell) => cell.column === 'TODAY');
    expect(today?.pending).toBe(true);
  });

  it('refuses a week of another PM', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week({ team: { name: 'Team A', pmId: 'PM002' } }));

    await expect(service.getSheet(PM, 'week-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repository.findTeamMembers).not.toHaveBeenCalled();
  });

  it('refuses another PM the week of a team they do not manage', async () => {
    // The same week, asked for by the PM who does not own the team.
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week({ team: { name: 'Team A', pmId: 'PM001' } }));

    await expect(service.getSheet(OTHER_PM, 'week-1')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('answers 404 for a week that does not exist', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(null);

    await expect(service.getSheet(PM, 'week-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('reads the tasks one day before the week, so Monday\'s yesterday is there', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findTasksForSheet.mockResolvedValue([]);
    repository.findSheetCells.mockResolvedValue([]);

    await service.getSheet(PM, 'week-1');

    const call = repository.findTasksForSheet.mock.calls[0];
    if (!call) throw new Error('the tasks were never looked for');
    const [workspaceId, userIds, from, to] = call;
    expect(workspaceId).toBe('w1');
    expect(userIds).toEqual(['BS23001']);
    expect(from.toISOString().slice(0, 10)).toBe('2026-11-22');
    expect(to.toISOString().slice(0, 10)).toBe('2026-11-29');
  });
});

describe('PmSheetService.saveCell (P4) — the optimistic lock', () => {
  const cellInput = (overrides: Record<string, unknown> = {}) => ({
    weekId: 'week-1',
    userId: 'BS23001',
    date: '2026-11-23',
    column: 'PLAN' as const,
    value: 'Finish the auth module',
    expectedVersion: 3,
    ...overrides,
  });

  it('refuses a day that is not in the sprint week', async () => {
    // The week runs Monday 2026-11-23 to Sunday 2026-11-29. A cell outside it would never
    // be shown: the sheet renders exactly the seven days of the week, so the row would be an
    // orphan a PM could write but never see again.
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);

    await expect(
      service.saveCell(PM, cellInput({ date: '2026-11-30' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repository.saveSheetCellIfVersion).not.toHaveBeenCalled();
  });

  it('refuses a day before the sprint week', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);

    await expect(
      service.saveCell(PM, cellInput({ date: '2026-11-22' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('accepts the Sunday that ends the sprint week', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell());
    repository.saveSheetCellIfVersion.mockResolvedValue({ count: 1 });
    repository.findSheetCell.mockResolvedValueOnce(storedCell()).mockResolvedValueOnce(
      storedCell({ value: 'Finish the auth module', version: 4 }),
    );

    const saved = await service.saveCell(PM, cellInput({ date: '2026-11-29' }));

    expect(saved.version).toBe(4);
  });

  it('saves the cell when the version is the one the editor saw', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell());
    repository.saveSheetCellIfVersion.mockResolvedValue({ count: 1 });
    repository.findSheetCell.mockResolvedValueOnce(storedCell()).mockResolvedValueOnce(
      storedCell({ value: 'Finish the auth module', version: 4 }),
    );

    const saved = await service.saveCell(PM, cellInput());

    expect(saved.version).toBe(4);
    expect(saved.value).toBe('Finish the auth module');
  });

  it('answers 409 when somebody else changed the cell first', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell({ version: 4 }));

    await expect(service.saveCell(PM, cellInput())).rejects.toMatchObject({
      code: 'CELL_CONFLICT',
    });
    expect(repository.saveSheetCellIfVersion).not.toHaveBeenCalled();
  });

  it('tells the UI what the cell says now, so the conflict dialog can show it', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell({ version: 4, value: 'Their text' }));

    await expect(service.saveCell(PM, cellInput())).rejects.toMatchObject({
      code: 'CELL_CONFLICT',
      details: {
        expectedVersion: 3,
        currentVersion: 4,
        currentValue: 'Their text',
      },
    });
  });

  it('answers 409 when the cell changed between the read and the write', async () => {
    // The row still said version 3 when it was read, but the conditional write changed
    // nothing: another editor was faster.
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell());
    repository.saveSheetCellIfVersion.mockResolvedValue({ count: 0 });

    await expect(service.saveCell(PM, cellInput())).rejects.toMatchObject({
      code: 'CELL_CONFLICT',
    });
  });

  it('writes the old value into the history, in the same transaction as the new one', async () => {
    const { service, repository, tx } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell());
    repository.saveSheetCellIfVersion.mockResolvedValue({ count: 1 });
    repository.findSheetCell.mockResolvedValueOnce(storedCell()).mockResolvedValueOnce(
      storedCell({ version: 4 }),
    );

    await service.saveCell(PM, cellInput());

    const versionCall = repository.createSheetCellVersion.mock.calls[0];
    if (!versionCall) throw new Error('the history was never written');
    expect(versionCall[0]).toMatchObject({
      cellId: 'cell-1',
      version: 3,
      value: 'Finish the auth module',
      editedByPmId: 'PM001',
      editedAt: NOW,
    });

    // The write goes through the transaction handle, so the new value and the history
    // commit together.
    const writeCall = repository.saveSheetCellIfVersion.mock.calls[0];
    if (!writeCall) throw new Error('the cell was never written');
    expect(writeCall[0]).toBe(tx);
  });

  it('writes only while the version is still the one the editor saw', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(storedCell());
    repository.saveSheetCellIfVersion.mockResolvedValue({ count: 1 });
    repository.findSheetCell.mockResolvedValueOnce(storedCell()).mockResolvedValueOnce(
      storedCell({ version: 4 }),
    );

    await service.saveCell(PM, cellInput());

    const call = repository.saveSheetCellIfVersion.mock.calls[0];
    if (!call) throw new Error('the cell was never written');
    expect(call[1]).toBe('cell-1');
    expect(call[2]).toBe(3);
  });

  it('creates the cell when there is none and the editor saw version 0', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(null);
    repository.createSheetCell.mockResolvedValue(storedCell({ version: 1, value: 'New note' }));

    const saved = await service.saveCell(PM, cellInput({ expectedVersion: 0, value: 'New note' }));

    expect(saved.version).toBe(1);
    expect(repository.createSheetCell).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when the editor saw a cell that is now gone', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(null);

    await expect(service.saveCell(PM, cellInput({ expectedVersion: 3 }))).rejects.toMatchObject({
      code: 'CELL_CONFLICT',
    });
    expect(repository.createSheetCell).not.toHaveBeenCalled();
  });

  it('answers 409 when two editors create the same cell at the same time', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(null);
    repository.createSheetCell.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.saveCell(PM, cellInput({ expectedVersion: 0 })),
    ).rejects.toMatchObject({
      code: 'CELL_CONFLICT',
    });
  });

  it('refuses a cell for somebody who is not a member of the team', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);

    await expect(service.saveCell(PM, cellInput({ userId: 'BS99999' }))).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repository.saveSheetCellIfVersion).not.toHaveBeenCalled();
  });

  it('refuses a week of another PM', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week({ team: { name: 'Team A', pmId: 'PM002' } }));

    await expect(service.saveCell(PM, cellInput())).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    expect(repository.findTeamMembers).not.toHaveBeenCalled();
  });

  it('records the PM who signed in, never one from the request', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week());
    repository.findTeamMembers.mockResolvedValue([membership()]);
    repository.findSheetCell.mockResolvedValue(null);
    repository.createSheetCell.mockResolvedValue(storedCell({ version: 1 }));

    await service.saveCell(PM, cellInput({ expectedVersion: 0 }));

    const call = repository.createSheetCell.mock.calls[0];
    if (!call) throw new Error('the cell was never written');
    expect(call[0]).toMatchObject({
      authorPmId: 'PM001',
      authorUserId: null,
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });
  });

  it('refuses a user: the sheet is a PM page', async () => {
    const { service, repository } = makeService();

    await expect(service.saveCell(USER, cellInput())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repository.findSprintWeek).not.toHaveBeenCalled();
  });

  it('throws a SprintError, so the filter can turn it into the shared envelope', async () => {
    const { service, repository } = makeService();
    repository.findSprintWeek.mockResolvedValue(week({ team: { name: 'Team A', pmId: 'PM002' } }));

    await expect(service.getSheet(PM, 'week-1')).rejects.toThrow(SprintError);
  });
});
