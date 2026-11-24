import { SprintError } from './errors.js';
import { NO_REPLY_AFTER_HOURS, PmSprintService } from './pm-sprint.service.js';
import type { SprintRepository } from './sprint.repository.js';
import type { SprintActor } from './http/actor.js';
import type { NotificationPort } from './ports/notification.port.js';
import type { ClockPort } from './time/clock.port.js';

/**
 * The rules of the PM side of the sprint module.
 *
 * The rules under test:
 * - a PM records the owner's answer **only for their own users**; somebody else's task is
 *   403 `FORBIDDEN_SCOPE` (PRD BR-08, SRS DS-02.5),
 * - the answer is recorded **once**: the second attempt is 409 `ALREADY_DECIDED`, and the
 *   write itself is conditional so two PMs at the same moment produce one decision
 *   (PRD BR-07, F-06),
 * - a task that needs no verification cannot be decided (there is no owner to answer),
 * - the answer and the notice that reports it are written **in one transaction** (DS-02.6),
 * - the no-reply job escalates a task exactly once, 24 hours after the owner was asked
 *   (DS-09), and never escalates the same task twice.
 */

const PM: SprintActor = { role: 'PM', pmId: 'PM001', workspaceId: 'w1' };
const OTHER_PM: SprintActor = { role: 'PM', pmId: 'PM002', workspaceId: 'w1' };
const USER: SprintActor = { role: 'TRAINEE', userId: 'BS23001', workspaceId: 'w1' };

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka: a Monday, at the cutoff. */
const NOW = new Date('2026-11-23T04:00:00Z');

/** A task that is waiting for its owner, owned by the user of PM001. */
const pendingTask = (overrides: Record<string, unknown> = {}) => ({
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
  category: 'LND',
  ownerId: 'owner-1',
  verification: 'PENDING',
  carriedFromId: null,
  ownerRequestedAt: new Date('2026-11-22T04:00:00Z'),
  createdAt: new Date('2026-11-22T04:00:00Z'),
  updatedAt: new Date('2026-11-22T04:00:00Z'),
  owner: { name: 'L&D team', email: 'lnd@example.test' },
  user: { pmId: 'PM001', name: 'A User' },
  ...overrides,
});

/** A task that needs no verification: done for oneself. */
const ownTask = (overrides: Record<string, unknown> = {}) =>
  pendingTask({
    category: null,
    ownerId: null,
    verification: null,
    ownerRequestedAt: null,
    owner: null,
    ...overrides,
  });

const makeRepository = () => ({
  findTaskForOwnerReply: vi.fn<(args: unknown) => Promise<unknown>>(),
  findTaskById: vi.fn<(args: unknown) => Promise<unknown>>(),
  decideOwnerReply: vi.fn<(tx: unknown, taskId: string, data: Record<string, unknown>) => Promise<unknown>>(),
  findWorkspacesWithPendingTasks: vi.fn<(args: unknown) => Promise<unknown[]>>(),
  findStalePendingTasks: vi.fn<(workspaceId: string, askedBefore: Date) => Promise<unknown[]>>(),
  markPendingAlertSent: vi.fn<(tx: unknown, taskId: string, sentAt: Date) => Promise<unknown>>(),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(),
});

const makeService = (options: { now?: Date } = {}) => {
  const repository = makeRepository();
  const clock: ClockPort = { now: () => options.now ?? NOW };
  const notifications = {
    notifyPm: vi.fn<(tx: unknown, notice: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    ),
    notifyUser: vi.fn<(tx: unknown, notice: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    ),
  };

  // The transaction handle: the fake methods sit on it directly, the way Prisma's do.
  const tx = {} as never;
  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work(tx),
  );

  const service = new PmSprintService(
    repository as unknown as SprintRepository,
    clock,
    notifications as unknown as NotificationPort,
  );

  return { service, repository, notifications, tx };
};

describe('PmSprintService.recordOwnerReply (P7)', () => {
  it('records the decision for a task of the PM\'s own user', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(
      pendingTask({ verification: 'VERIFIED', owner: { name: 'L&D team' } }),
    );

    const result = await service.recordOwnerReply(PM, 'task-1', 'VERIFIED');

    expect(result.verification).toBe('VERIFIED');
    expect(result.title).toBe('Fix the login bug');
  });

  it('scopes the lookup to the caller\'s own workspace', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));

    await service.recordOwnerReply(PM, 'task-1', 'VERIFIED');

    expect(repository.findTaskForOwnerReply).toHaveBeenCalledWith('w1', 'task-1');
  });

  it('writes the decision with the PM who recorded it and the instant of the reply', async () => {
    const { service, repository, tx } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));

    await service.recordOwnerReply(PM, 'task-1', 'NOT_CONFIRMED');

    const call = repository.decideOwnerReply.mock.calls[0];
    if (!call) throw new Error('the decision was never written');
    const [writeTx, taskId, data] = call;
    // The decision is written through the transaction handle, so it and the notice commit
    // together.
    expect(writeTx).toBe(tx);
    expect(taskId).toBe('task-1');
    expect(data).toMatchObject({
      verification: 'NOT_CONFIRMED',
      ownerReplyById: 'PM001',
      ownerRepliedAt: NOW,
    });
  });

  it('records the decision through the transaction handle', async () => {
    const { service, repository, tx } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));

    await service.recordOwnerReply(PM, 'task-1', 'VERIFIED');

    const call = repository.decideOwnerReply.mock.calls[0];
    if (!call) throw new Error('the decision was never written');
    expect(call[0]).toBe(tx);
  });

  it('tells the PM about the answer inside the same transaction', async () => {
    const { service, repository, notifications, tx } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));

    await service.recordOwnerReply(PM, 'task-1', 'VERIFIED');

    expect(notifications.notifyPm).toHaveBeenCalledTimes(1);
    const call = notifications.notifyPm.mock.calls[0];
    if (!call) throw new Error('the notice was never sent');
    const [noticeTx, notice] = call;
    // The notice and the decision commit together.
    expect(noticeTx).toBe(tx);
    expect(notice).toMatchObject({
      pmId: 'PM001',
      workspaceId: 'w1',
      category: 'Sprint awaiting review',
    });
  });

  it('refuses a task of a user another PM manages', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(
      pendingTask({ user: { pmId: 'PM002', name: 'A User' } }),
    );

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toThrow(SprintError);
    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('writes nothing when the task is out of scope', async () => {
    const { service, repository, notifications } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(
      pendingTask({ user: { pmId: 'PM002', name: 'A User' } }),
    );

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toThrow(SprintError);

    expect(repository.decideOwnerReply).not.toHaveBeenCalled();
    expect(notifications.notifyPm).not.toHaveBeenCalled();
  });

  it('refuses a PM who tries to answer for another workspace', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(null);

    await expect(service.recordOwnerReply(OTHER_PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('answers 404 when the task does not exist', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(null);

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('refuses a task that needs no verification: there is no owner to answer', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(ownTask());

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(repository.decideOwnerReply).not.toHaveBeenCalled();
  });

  it('answers 409 when the task was already decided', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(
      pendingTask({ verification: 'VERIFIED' }),
    );

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toThrow(SprintError);
    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'ALREADY_DECIDED',
    });
  });

  it('answers 409 when somebody decided the task between the read and the write', async () => {
    // The row was still PENDING when it was read, but the conditional update changed nothing:
    // another PM decided it first.
    const { service, repository, notifications } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 0 });

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'ALREADY_DECIDED',
    });
    // The loser of the race tells nobody: only the winner's decision is reported.
    expect(notifications.notifyPm).not.toHaveBeenCalled();
  });

  it('refuses a user: recording the answer is a PM action', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());

    await expect(service.recordOwnerReply(USER, 'task-1', 'VERIFIED')).rejects.toThrow(SprintError);
    await expect(service.recordOwnerReply(USER, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('never takes the PM or the user from the request', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));

    await service.recordOwnerReply(PM, 'task-1', 'VERIFIED');

    // The PM who recorded it is the one who is signed in.
    const call = repository.decideOwnerReply.mock.calls[0];
    if (!call) throw new Error('the decision was never written');
    const [, , data] = call;
    expect(data.ownerReplyById).toBe('PM001');
  });

  it('answers 404 when the task disappears between the write and the read back', async () => {
    const { service, repository } = makeService();
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
    repository.decideOwnerReply.mockResolvedValue({ count: 1 });
    repository.findTaskById.mockResolvedValue(null);

    await expect(service.recordOwnerReply(PM, 'task-1', 'VERIFIED')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('PmSprintService.runNoReplyCheck (S1)', () => {
  /** A task that was asked for 25 hours ago and has not been answered. */
  const staleTask = (overrides: Record<string, unknown> = {}) => ({
    id: 'task-1',
    userId: 'BS23001',
    title: 'Fix the login bug',
    ownerId: 'owner-1',
    ownerRequestedAt: new Date('2026-11-22T03:00:00Z'),
    user: { pmId: 'PM001', name: 'A User' },
    owner: { name: 'L&D team', email: 'lnd@example.test' },
    ...overrides,
  });

  it('tells the PM about a task whose owner has not answered for a day', async () => {
    const { service, repository, notifications } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }]);
    repository.findStalePendingTasks.mockResolvedValue([staleTask()]);
    repository.markPendingAlertSent.mockResolvedValue({ count: 1 });

    const escalated = await service.runNoReplyCheck(NOW);

    expect(escalated).toBe(1);
    expect(notifications.notifyPm).toHaveBeenCalledTimes(1);
    const call = notifications.notifyPm.mock.calls[0];
    if (!call) throw new Error('the notice was never sent');
    const [, notice] = call;
    expect(notice).toMatchObject({ pmId: 'PM001', workspaceId: 'w1' });
  });

  it('looks a day back from the moment the job runs', async () => {
    const { service, repository } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }]);
    repository.findStalePendingTasks.mockResolvedValue([]);

    await service.runNoReplyCheck(NOW);

    // The window is the same for both queries: the workspace scan and the task scan.
    const workspaceCall = repository.findWorkspacesWithPendingTasks.mock.calls[0];
    if (!workspaceCall) throw new Error('the workspaces were never looked for');
    const [askedBefore] = workspaceCall as [Date];
    expect(askedBefore.toISOString()).toBe(
      new Date(NOW.getTime() - NO_REPLY_AFTER_HOURS * 60 * 60 * 1000).toISOString(),
    );

    const taskCall = repository.findStalePendingTasks.mock.calls[0];
    if (!taskCall) throw new Error('the candidates were never looked for');
    const [, taskAskedBefore] = taskCall as [string, Date];
    expect(taskAskedBefore.toISOString()).toBe(askedBefore.toISOString());
  });

  it('marks the task as escalated and tells the PM in one transaction', async () => {
    const { service, repository, notifications, tx } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }]);
    repository.findStalePendingTasks.mockResolvedValue([staleTask()]);
    repository.markPendingAlertSent.mockResolvedValue({ count: 1 });

    await service.runNoReplyCheck(NOW);

    const markCall = repository.markPendingAlertSent.mock.calls[0];
    if (!markCall) throw new Error('the task was never marked');
    const [markTx, taskId, sentAt] = markCall;
    expect(markTx).toBe(tx);
    expect(taskId).toBe('task-1');
    expect(sentAt).toBe(NOW);

    const noticeCall = notifications.notifyPm.mock.calls[0];
    if (!noticeCall) throw new Error('the notice was never sent');
    expect(noticeCall[0]).toBe(tx);
  });

  it('never tells the PM twice about the same task', async () => {
    // The mark changes no row: the task was already escalated, by this run or another.
    const { service, repository, notifications } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }]);
    repository.findStalePendingTasks.mockResolvedValue([staleTask()]);
    repository.markPendingAlertSent.mockResolvedValue({ count: 0 });

    const escalated = await service.runNoReplyCheck(NOW);

    expect(escalated).toBe(0);
    expect(notifications.notifyPm).not.toHaveBeenCalled();
  });

  it('escalates nothing when no workspace has a stale task', async () => {
    const { service, repository, notifications } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([]);

    const escalated = await service.runNoReplyCheck(NOW);

    expect(escalated).toBe(0);
    expect(repository.findStalePendingTasks).not.toHaveBeenCalled();
    expect(notifications.notifyPm).not.toHaveBeenCalled();
  });

  it('counts the tasks it escalated across every workspace', async () => {
    const { service, repository } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]);
    repository.findStalePendingTasks.mockResolvedValue([staleTask({ id: 'task-1' })]);
    repository.markPendingAlertSent.mockResolvedValue({ count: 1 });

    const escalated = await service.runNoReplyCheck(NOW);

    expect(escalated).toBe(2);
    expect(repository.findStalePendingTasks).toHaveBeenCalledWith('w1', expect.any(Date));
    expect(repository.findStalePendingTasks).toHaveBeenCalledWith('w2', expect.any(Date));
  });

  it('skips a task whose user has no PM to tell', async () => {
    const { service, repository, notifications } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([{ id: 'w1' }]);
    repository.findStalePendingTasks.mockResolvedValue([staleTask({ user: null })]);
    repository.markPendingAlertSent.mockResolvedValue({ count: 1 });

    const escalated = await service.runNoReplyCheck(NOW);

    expect(escalated).toBe(0);
    expect(notifications.notifyPm).not.toHaveBeenCalled();
  });

  it('uses the clock when no moment is given', async () => {
    const { service, repository } = makeService();
    repository.findWorkspacesWithPendingTasks.mockResolvedValue([]);
    repository.findStalePendingTasks.mockResolvedValue([]);

    await service.runNoReplyCheck();

    const call = repository.findWorkspacesWithPendingTasks.mock.calls[0];
    if (!call) throw new Error('the workspaces were never looked for');
    const [askedBefore] = call as [Date];
    expect(askedBefore.toISOString()).toBe(
      new Date(NOW.getTime() - NO_REPLY_AFTER_HOURS * 60 * 60 * 1000).toISOString(),
    );
  });
});
