import { SprintError } from './errors.js';
import { SprintService } from './sprint.service.js';
import type { SprintRepository } from './sprint.repository.js';
import type { SprintActor } from './http/actor.js';
import type { ApprovalMailPort } from './ports/approval-mail.port.js';
import type { CalendarPort } from './ports/calendar.port.js';
import type { XpLedgerPort } from './ports/xp-ledger.port.js';
import type { ClockPort } from './time/clock.port.js';

/**
 * The business rules of the user-side sprint endpoints.
 *
 * The repository is a fake here, so the rules are tested on their own: what the service asks
 * the database for, and what it refuses. The queries themselves are covered by the route
 * tests in `sprint.routes.spec.ts`.
 *
 * The rules under test (SRS 5.3, PRD):
 * - a user sees only their own tasks; another user's task is **not found** (BR-08),
 * - a category and an owner go together, and the owner's category has to match (DS-01.3, DS-01.6),
 * - an inactive owner cannot be asked to verify anything (DS-01.6),
 * - an archived user creates nothing; their history stays readable (E-25),
 * - a deleted task never shows up again (BR-09),
 * - a carry forward is idempotent (DS-04.4),
 * - a missing figure is missing, not zero (NFR-09).
 */

const USER: SprintActor = { role: 'TRAINEE', userId: 'BS23001', workspaceId: 'w1' };
const PM: SprintActor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka: a Monday, at the cutoff. */
const NOW = new Date('2026-11-23T04:00:00Z');

const taskRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  workspaceId: 'w1',
  userId: 'BS23001',
  date: new Date('2026-11-23T00:00:00Z'),
  title: 'Fix the login bug',
  description: 'auth module',
  plannedHours: 2,
  actualHours: 1,
  blocker: '',
  done: false,
  category: null,
  ownerId: null,
  verification: null,
  carriedFromId: null,
  ownerRequestedAt: null,
  createdAt: new Date('2026-11-23T01:00:00Z'),
  updatedAt: new Date('2026-11-23T01:00:00Z'),
  owner: null,
  ...overrides,
});

/**
 * The fake repository.
 *
 * The mock functions carry their type argument so a test can hand them a value of any shape:
 * a bare `vi.fn()` only ever accepts `undefined`.
 */
const makeRepository = () => ({
  findUser: vi.fn<(args: unknown) => Promise<unknown>>(),
  findActiveOwners: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findOwner: vi.fn<(args: unknown) => Promise<unknown>>(),
  findUserTasksForDay: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findUserTasksForDayTx: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findCarryCandidates: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findOwnTask: vi.fn<(args: unknown) => Promise<unknown>>(),
  createTask: vi.fn<(args: unknown) => Promise<unknown>>(),
  updateTask: vi.fn<(args: unknown) => Promise<unknown>>(),
  softDeleteTask: vi.fn<(args: unknown) => Promise<unknown>>(),
  findUserTasksBetween: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findUserSubmissionsBetween: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findUserSubmissionsPage: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findUserTasksOfDayTx: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findCarryCandidatesTx: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  copyTaskIfNotCarried: vi.fn<(tx: unknown, args: unknown) => Promise<unknown>>(),
  findNextMeeting: vi.fn<(args: unknown) => Promise<unknown>>(),
  findXpRule: vi.fn<(args: unknown) => Promise<unknown>>(),
  findSubmission: vi.fn<(args: unknown) => Promise<unknown>>(),
  createSubmission: vi.fn<(args: unknown) => Promise<unknown>>(),
  createSubmissionTx: vi.fn<(args: unknown) => Promise<unknown>>(),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(),
});

const makeService = () => {
  const repository = makeRepository();
  const clock: ClockPort = { now: () => NOW };
  const calendar = {
    previousWorkingDay: vi.fn<(args: unknown) => Promise<string | null>>(async () => '2026-11-22'),
    isWorkingDay: vi.fn<(args: unknown) => Promise<boolean>>(async () => true),
  };
  const approvalMail = {
    requestOwnerApproval: vi.fn<(args: unknown) => Promise<void>>(async () => undefined),
  };
  const xpLedger = {
    awardOnTimeSprint: vi.fn<(args: unknown) => Promise<void>>(async () => undefined),
  };

  const service = new SprintService(
    repository as unknown as SprintRepository,
    clock,
    calendar as unknown as CalendarPort,
    approvalMail as unknown as ApprovalMailPort,
    xpLedger as unknown as XpLedgerPort,
  );

  return { service, repository, calendar, approvalMail, xpLedger };
};

/** A transaction handle that behaves like Prisma's: the fake methods are on it directly. */
const asTransaction = () =>
  ({
    sprintTask: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        taskRow({ id: 'task-new', ...data }),
      ),
    },
  }) as never;

describe('SprintService.listTaskOwners (U1)', () => {
  it('lists the active owners of the caller\'s own workspace', async () => {
    const { service, repository } = makeService();
    repository.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', name: 'L&D team', kind: 'LND', email: 'lnd@example.test' },
    ]);

    const owners = await service.listTaskOwners(USER, 'LND');

    expect(repository.findActiveOwners).toHaveBeenCalledWith('w1', 'LND');
    expect(owners).toEqual([
      { id: 'owner-1', name: 'L&D team', kind: 'LND', email: 'lnd@example.test' },
    ]);
  });

  it('refuses a PM: the owner list belongs to a user', async () => {
    const { service } = makeService();
    await expect(service.listTaskOwners(PM, 'LND')).rejects.toThrow(SprintError);
    await expect(service.listTaskOwners(PM, 'LND')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('SprintService.getBoard (U2)', () => {
  it('shows the caller\'s own tasks of the day', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksForDay.mockResolvedValue([taskRow()]);
    repository.findCarryCandidates.mockResolvedValue([]);

    const board = await service.getBoard(USER, '2026-11-23');

    expect(repository.findUserTasksForDay).toHaveBeenCalledWith(
      'w1',
      'BS23001',
      new Date('2026-11-23T00:00:00Z'),
    );
    expect(board.date).toBe('2026-11-23');
    expect(board.tasks).toHaveLength(1);
    expect(board.tasks[0].title).toBe('Fix the login bug');
  });

  it('defaults to today in org time when no day is given', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksForDay.mockResolvedValue([]);
    repository.findCarryCandidates.mockResolvedValue([]);

    const board = await service.getBoard(USER);

    expect(board.date).toBe('2026-11-23');
    expect(repository.findUserTasksForDay).toHaveBeenCalledWith(
      'w1',
      'BS23001',
      new Date('2026-11-23T00:00:00Z'),
    );
  });

  it('returns the carry candidates read-only, without creating anything', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksForDay.mockResolvedValue([]);
    repository.findCarryCandidates.mockResolvedValue([taskRow({ id: 'task-2' })]);

    const board = await service.getBoard(USER, '2026-11-23');

    expect(board.carryCandidates).toHaveLength(1);
    expect(repository.createTask).not.toHaveBeenCalled();
  });

  it('never shows a task of another user', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksForDay.mockResolvedValue([]);
    repository.findCarryCandidates.mockResolvedValue([]);

    await service.getBoard(USER, '2026-11-23');

    // The query is scoped to the caller's own id, so another user's row cannot come back.
    expect(repository.findUserTasksForDay).toHaveBeenCalledWith(
      'w1',
      'BS23001',
      expect.any(Date),
    );
  });
});

describe('SprintService.createTask (U3)', () => {
  const valid = {
    title: 'Fix the login bug',
    description: 'auth module',
    date: '2026-11-23',
    plannedHours: 2,
  };

  it('creates a task for oneself, with neither a category nor an owner', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
      work(asTransaction()),
    );

    const task = await service.createTask(USER, valid);

    expect(task.title).toBe('Fix the login bug');
    expect(task.category).toBeNull();
    expect(task.ownerId).toBeNull();
    expect(task.verification).toBeNull();
  });

  it('creates a task for an L&D team, with the category and the owner, and asks the owner', async () => {
    const { service, repository, approvalMail } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.findOwner.mockResolvedValue({
      id: 'owner-1',
      name: 'L&D team',
      kind: 'LND',
      email: 'lnd@example.test',
      isActive: true,
    });
    repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
      work(asTransaction()),
    );

    const task = await service.createTask(USER, {
      ...valid,
      category: 'LND',
      ownerId: 'owner-1',
    });

    expect(task.category).toBe('LND');
    expect(task.ownerId).toBe('owner-1');
    expect(task.verification).toBe('PENDING');
    // DS-02.1: the task and the mail request are written in one transaction.
    expect(approvalMail.requestOwnerApproval).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sprintTaskId: 'task-new',
        recipient: 'lnd@example.test',
      }),
    );
  });

  it('refuses a category without an owner', async () => {
    const { service } = makeService();
    await expect(
      service.createTask(USER, { ...valid, category: 'LND' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_OWNER_MISMATCH' });
  });

  it('refuses an owner without a category', async () => {
    const { service } = makeService();
    await expect(
      service.createTask(USER, { ...valid, ownerId: 'owner-1' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_OWNER_MISMATCH' });
  });

  it('refuses an owner of another category', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.findOwner.mockResolvedValue({
      id: 'owner-1',
      name: 'An SBU',
      kind: 'SBU',
      email: 'sbu@example.test',
      isActive: true,
    });

    await expect(
      service.createTask(USER, { ...valid, category: 'LND', ownerId: 'owner-1' }),
    ).rejects.toMatchObject({ code: 'CATEGORY_OWNER_MISMATCH' });
  });

  it('refuses an owner that is not active', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.findOwner.mockResolvedValue({
      id: 'owner-1',
      name: 'An old team',
      kind: 'LND',
      email: 'old@example.test',
      isActive: false,
    });

    await expect(
      service.createTask(USER, { ...valid, category: 'LND', ownerId: 'owner-1' }),
    ).rejects.toMatchObject({ code: 'OWNER_INACTIVE' });
  });

  it('refuses an owner that does not exist', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.findOwner.mockResolvedValue(null);

    await expect(
      service.createTask(USER, { ...valid, category: 'LND', ownerId: 'owner-9' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses an archived user', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({
      userId: 'BS23001',
      archivedAt: new Date('2026-11-01T00:00:00Z'),
    });

    await expect(service.createTask(USER, valid)).rejects.toMatchObject({
      code: 'USER_ARCHIVED',
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('refuses a PM: a task belongs to a user', async () => {
    const { service } = makeService();
    await expect(service.createTask(PM, valid)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('SprintService.updateTask (U4)', () => {
  it('updates a field of the caller\'s own task', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(taskRow());
    repository.updateTask.mockResolvedValue(taskRow({ done: true, actualHours: 3 }));

    const task = await service.updateTask(USER, 'task-1', { done: true, actualHours: 3 });

    expect(repository.updateTask).toHaveBeenCalledWith('task-1', { done: true, actualHours: 3 });
    expect(task.done).toBe(true);
    expect(task.actualHours).toBe(3);
  });

  it('changes only the fields that were sent', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(taskRow());
    repository.updateTask.mockResolvedValue(taskRow());

    await service.updateTask(USER, 'task-1', { title: 'A new title' });

    expect(repository.updateTask).toHaveBeenCalledWith('task-1', { title: 'A new title' });
  });

  it('does not find a task of another user', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(null);

    await expect(service.updateTask(USER, 'task-9', { done: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repository.updateTask).not.toHaveBeenCalled();
  });

  it('does not find a deleted task', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(null);

    await expect(service.updateTask(USER, 'task-1', { done: true })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('SprintService.deleteTask (U5)', () => {
  it('soft-deletes the caller\'s own task', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(taskRow());

    await service.deleteTask(USER, 'task-1');

    expect(repository.softDeleteTask).toHaveBeenCalledWith('task-1', NOW);
  });

  it('does not delete a task of another user', async () => {
    const { service, repository } = makeService();
    repository.findOwnTask.mockResolvedValue(null);

    await expect(service.deleteTask(USER, 'task-9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repository.softDeleteTask).not.toHaveBeenCalled();
  });
});

describe('SprintService.carryForward (U6)', () => {
  /**
   * Sets the service up with the tasks of the previous day.
   *
   * The filtering — open tasks that were not carried forward yet — lives in the **query**
   * (`findCarryCandidatesTx`), because a filter in the service would not see the copy, which
   * lives on the target day. So the mock answers exactly what that query would answer, and
   * the tests below say which rows the query leaves out.
   *
   * The copy itself goes through `copyTaskIfNotCarried`, which is where the **unique index**
   * on `carriedFromId` decides that a task is carried at most once. The mock answers with a
   * copy, or with `null` when somebody else carried the task in the meantime.
   */
  const setup = (tasks: unknown[], candidates?: unknown[]) => {
    const { service, repository, calendar } = makeService();
    repository.findUser.mockResolvedValue({ userId: 'BS23001', archivedAt: null });
    repository.findCarryCandidatesTx.mockResolvedValue(candidates ?? tasks);
    repository.copyTaskIfNotCarried.mockImplementation(async (_tx: unknown, args: unknown) => {
      const source = (args as { source: { id: string } }).source;
      return taskRow({ id: `copy-of-${source.id}`, carriedFromId: source.id });
    });
    repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
      work(asTransaction()),
    );
    return { service, repository, calendar };
  };

  it('carries the open tasks of the previous working day', async () => {
    // The previous day holds two tasks, but only the open one is a candidate: the query
    // leaves out the done task.
    const { service, repository, calendar } = setup(
      [taskRow({ id: 'task-1', done: false }), taskRow({ id: 'task-2', done: true })],
      [taskRow({ id: 'task-1', done: false })],
    );

    const result = await service.carryForward(USER, '2026-11-23');

    expect(calendar.previousWorkingDay).toHaveBeenCalled();
    expect(repository.findCarryCandidatesTx).toHaveBeenCalledWith(
      expect.anything(),
      'w1',
      'BS23001',
      new Date('2026-11-22T00:00:00Z'),
    );
    // Only the open task is carried; the done one is left alone.
    expect(result.carried).toHaveLength(1);
  });

  it('points the copy back at the task it came from', async () => {
    const { service, repository } = setup([taskRow({ id: 'task-1', done: false })]);

    await service.carryForward(USER, '2026-11-23');

    // The repository creates the copy with carriedFromId = the original id.
    expect(repository.copyTaskIfNotCarried).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaceId: 'w1',
        userId: 'BS23001',
        date: new Date('2026-11-23T00:00:00Z'),
        source: expect.objectContaining({ id: 'task-1' }),
      }),
    );
  });

  it('carries nothing when there is no previous working day', async () => {
    const { service, calendar } = setup([]);
    calendar.previousWorkingDay.mockResolvedValue(null);

    const result = await service.carryForward(USER, '2026-11-23');

    expect(result.carried).toEqual([]);
  });

  it('carries nothing when every task of the previous day was already carried', async () => {
    // The task is a copy of an earlier one, so the candidate query leaves it out.
    const { service } = setup(
      [taskRow({ id: 'task-1', carriedFromId: 'task-0' })],
      [],
    );

    const result = await service.carryForward(USER, '2026-11-23');

    expect(result.carried).toEqual([]);
  });

  it('carries nothing when the previous day has no task that is still open', async () => {
    // The candidate query leaves out the done tasks and the ones that were carried already.
    const { service } = setup([taskRow({ id: 'task-1', done: true })], []);

    const result = await service.carryForward(USER, '2026-11-23');

    expect(result.carried).toEqual([]);
  });

  it('asks the repository for the candidates, so a task cannot be carried twice', async () => {
    // The copy lives on the TARGET day, so a filter on the previous day's rows would not see
    // it: a second carry-forward would copy the same source task again. The guard has to be
    // in the query, which is why the service asks for the candidates rather than for the
    // day's tasks.
    const { service, repository } = setup([taskRow({ id: 'task-1', done: false })]);

    await service.carryForward(USER, '2026-11-23');

    expect(repository.findCarryCandidatesTx).toHaveBeenCalled();
    expect(repository.findUserTasksOfDayTx).not.toHaveBeenCalled();
  });

  it('leaves out a task that another request carried in the meantime', async () => {
    // Two requests at the same moment (a double click, two tabs) both read the same open
    // task. The unique index on `carriedFromId` refuses the second copy, and the repository
    // answers `null` — the task is not carried twice, and it is simply not in the answer.
    const { service, repository } = setup([taskRow({ id: 'task-1', done: false })]);
    repository.copyTaskIfNotCarried.mockResolvedValue(null);

    const result = await service.carryForward(USER, '2026-11-23');

    expect(result.carried).toEqual([]);
  });

  it('carries the tasks that could still be carried, even when one of them is refused', async () => {
    // The refused copy must not undo the copies that already succeeded: the repository
    // writes each copy in its own savepoint.
    const { service, repository } = setup([
      taskRow({ id: 'task-1', done: false }),
      taskRow({ id: 'task-2', done: false }),
    ]);
    repository.copyTaskIfNotCarried
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(taskRow({ id: 'copy-of-task-2', carriedFromId: 'task-2' }));

    const result = await service.carryForward(USER, '2026-11-23');

    expect(result.carried).toHaveLength(1);
    expect(result.carried[0].carriedFromId).toBe('task-2');
  });

  it('refuses an archived user', async () => {
    const { service, repository } = makeService();
    repository.findUser.mockResolvedValue({
      userId: 'BS23001',
      archivedAt: new Date('2026-11-01T00:00:00Z'),
    });

    await expect(service.carryForward(USER, '2026-11-23')).rejects.toMatchObject({
      code: 'USER_ARCHIVED',
    });
  });
});

describe('SprintService.getSummary (U8)', () => {
  it('covers the last fourteen org days, ending today', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksBetween.mockResolvedValue([]);
    repository.findUserSubmissionsBetween.mockResolvedValue([]);

    const summary = await service.getSummary(USER);

    expect(summary.from).toBe('2026-11-10');
    expect(summary.to).toBe('2026-11-23');
    expect(summary.days).toHaveLength(14);
  });

  it('marks a day without tasks as missing, not as zero', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksBetween.mockResolvedValue([]);
    repository.findUserSubmissionsBetween.mockResolvedValue([]);

    const summary = await service.getSummary(USER);

    expect(summary.days[0].plannedHours).toEqual({ value: null, source: 'MISSING' });
    expect(summary.days[0].taskCount).toEqual({ value: null, source: 'MISSING' });
    expect(summary.days[0].submitted).toBe(false);
    expect(summary.days[0].onTime).toBeNull();
  });

  it('sums the hours of the tasks of a day', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksBetween.mockResolvedValue([
      taskRow({ date: new Date('2026-11-23T00:00:00Z'), plannedHours: 2, actualHours: 1.5 }),
      taskRow({ date: new Date('2026-11-23T00:00:00Z'), plannedHours: 3, actualHours: 0.5 }),
    ]);
    repository.findUserSubmissionsBetween.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: true },
    ]);

    const summary = await service.getSummary(USER);
    const today = summary.days[summary.days.length - 1];

    expect(today.date).toBe('2026-11-23');
    expect(today.plannedHours.value).toBe(5);
    expect(today.actualHours.value).toBe(2);
    expect(today.taskCount.value).toBe(2);
    expect(today.submitted).toBe(true);
    expect(today.onTime).toBe(true);
  });

  it('keeps the on-time flag of a submission', async () => {
    const { service, repository } = makeService();
    repository.findUserTasksBetween.mockResolvedValue([]);
    repository.findUserSubmissionsBetween.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: false },
    ]);

    const summary = await service.getSummary(USER);

    expect(summary.days[summary.days.length - 1].onTime).toBe(false);
  });
});

describe('SprintService.getHistory (U9)', () => {
  it('lists the submitted days, newest first', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: true },
      { date: new Date('2026-11-22T00:00:00Z'), submittedAt: NOW, onTime: false },
    ]);
    repository.findUserTasksBetween.mockResolvedValue([]);

    const history = await service.getHistory(USER, {});

    expect(history.data.map((row) => row.date)).toEqual(['2026-11-23', '2026-11-22']);
    expect(history.data[0].submitted).toBe(true);
    expect(history.data[0].onTime).toBe(true);
    expect(history.data[1].onTime).toBe(false);
  });

  it('asks for the default page size of twenty', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([]);

    await service.getHistory(USER, {});

    expect(repository.findUserSubmissionsPage).toHaveBeenCalledWith('w1', 'BS23001', null, 20);
  });

  it('passes the cursor on, so the next page starts before the last day', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([]);

    await service.getHistory(USER, { cursor: '2026-11-20', limit: 50 });

    expect(repository.findUserSubmissionsPage).toHaveBeenCalledWith(
      'w1',
      'BS23001',
      new Date('2026-11-20T00:00:00Z'),
      50,
    );
  });

  it('has no next cursor when the page is not full', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: true },
    ]);
    repository.findUserTasksBetween.mockResolvedValue([]);

    const history = await service.getHistory(USER, { limit: 20 });

    expect(history.meta.nextCursor).toBeNull();
  });

  it('has a next cursor when the page is full', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: true },
      { date: new Date('2026-11-22T00:00:00Z'), submittedAt: NOW, onTime: true },
    ]);
    repository.findUserTasksBetween.mockResolvedValue([]);

    const history = await service.getHistory(USER, { limit: 2 });

    expect(history.meta.nextCursor).toBe('2026-11-22');
  });

  it('marks the figures of a day without tasks as missing', async () => {
    const { service, repository } = makeService();
    repository.findUserSubmissionsPage.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00Z'), submittedAt: NOW, onTime: true },
    ]);
    repository.findUserTasksBetween.mockResolvedValue([]);

    const history = await service.getHistory(USER, {});

    expect(history.data[0].plannedHours).toEqual({ value: null, source: 'MISSING' });
    expect(history.data[0].taskCount).toEqual({ value: null, source: 'MISSING' });
  });
});

describe('SprintService.getMeetingBanner (U10)', () => {
  it('shows the next meeting with its day and time in org time', async () => {
    const { service, repository } = makeService();
    repository.findNextMeeting.mockResolvedValue({
      id: 'meeting-1',
      title: 'Daily stand-up',
      scheduledAt: new Date('2026-11-23T05:30:00Z'),
      teamsLink: 'https://teams.example.test/1',
      source: 'teams',
    });

    const meeting = await service.getMeetingBanner(USER);

    // 05:30Z is 11:30 in Dhaka.
    expect(meeting).toEqual({
      meeting: {
        id: 'meeting-1',
        title: 'Daily stand-up',
        date: '2026-11-23',
        time: '11:30',
        teamsLink: 'https://teams.example.test/1',
        source: 'teams',
      },
    });
  });

  it('shows nothing when there is no upcoming meeting', async () => {
    const { service, repository } = makeService();
    repository.findNextMeeting.mockResolvedValue(null);

    expect(await service.getMeetingBanner(USER)).toEqual({ meeting: null });
  });

  it('only looks forward from now', async () => {
    const { service, repository } = makeService();
    repository.findNextMeeting.mockResolvedValue(null);

    await service.getMeetingBanner(USER);

    expect(repository.findNextMeeting).toHaveBeenCalledWith('w1', 'BS23001', NOW);
  });

  it('refuses a PM: the banner is a user page', async () => {
    const { service, repository } = makeService();

    await expect(service.getMeetingBanner(PM)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(repository.findNextMeeting).not.toHaveBeenCalled();
  });
});
