import type { PrismaService } from '../../prisma/prisma.service.js';
import { SprintRepository } from './sprint.repository.js';

/**
 * The queries of the sprint module.
 *
 * The rules that keep one user out of another user's data are written into the `where` clause
 * of these queries, so they are tested here: every read is filtered by the **workspace**, and
 * every read of a task is filtered by the **owner** as well. A query that forgot a filter would
 * not fail a rule test — it would quietly show the wrong data — so the filter is the thing
 * under test.
 */

const makeRepository = () => {
  const db = {
    user: { findFirst: vi.fn() },
    taskOwner: { findMany: vi.fn(), findFirst: vi.fn() },
    sprintTask: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    sprintSubmission: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    xpRule: { findUnique: vi.fn() },
    dsMeeting: { findFirst: vi.fn() },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  } as unknown as PrismaService;
  const repository = new SprintRepository(prisma);
  return { repository, db };
};

describe('SprintRepository — the scope of every query', () => {
  it('filters a task by the workspace, the user and the day', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findUserTasksForDay('w1', 'BS23001', new Date('2026-11-23T00:00:00Z'));

    expect(db.sprintTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'w1',
          userId: 'BS23001',
          date: new Date('2026-11-23T00:00:00Z'),
          deletedAt: null,
        },
      }),
    );
  });

  it('never returns a deleted task', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findUserTasksForDay('w1', 'BS23001', new Date('2026-11-23T00:00:00Z'));

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
  });

  it('finds one of the caller\'s own tasks by id, and only that one', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findFirst.mockResolvedValue(null);

    await repository.findOwnTask('w1', 'BS23001', 'task-1');

    expect(db.sprintTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1', workspaceId: 'w1', userId: 'BS23001', deletedAt: null },
      }),
    );
  });

  it('looks a task up inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findFirst.mockResolvedValue(null);

    await repository.findOwnTask('w1', 'BS23001', 'task-1');

    const call = db.sprintTask.findFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('w1');
    expect(call.where.userId).toBe('BS23001');
  });

  it('asks only for the active owners of the workspace', async () => {
    const { repository, db } = makeRepository();
    db.taskOwner.findMany.mockResolvedValue([]);

    await repository.findActiveOwners('w1', 'LND');

    expect(db.taskOwner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1', kind: 'LND', isActive: true },
      }),
    );
  });

  it('looks an owner up inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.taskOwner.findFirst.mockResolvedValue(null);

    await repository.findOwner('w1', 'owner-1');

    expect(db.taskOwner.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'owner-1', workspaceId: 'w1' } }),
    );
  });

  it('looks the caller up inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.user.findFirst.mockResolvedValue(null);

    await repository.findUser('w1', 'BS23001');

    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId: 'w1', userId: 'BS23001' } }),
    );
  });

  it('reads the tasks of a day range for one user only', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findUserTasksBetween(
      'w1',
      'BS23001',
      new Date('2026-11-10T00:00:00Z'),
      new Date('2026-11-23T00:00:00Z'),
    );

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('w1');
    expect(call.where.userId).toBe('BS23001');
    expect(call.where.date).toEqual({
      gte: new Date('2026-11-10T00:00:00Z'),
      lte: new Date('2026-11-23T00:00:00Z'),
    });
    expect(call.where.deletedAt).toBeNull();
  });

  it('reads the submissions of a day range for one user only', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findUserSubmissionsBetween(
      'w1',
      'BS23001',
      new Date('2026-11-10T00:00:00Z'),
      new Date('2026-11-23T00:00:00Z'),
    );

    const call = db.sprintSubmission.findMany.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('w1');
    expect(call.where.userId).toBe('BS23001');
  });

  it('pages the submissions with the cursor as an upper bound', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findUserSubmissionsPage(
      'w1',
      'BS23001',
      new Date('2026-11-20T00:00:00Z'),
      20,
    );

    const call = db.sprintSubmission.findMany.mock.calls[0][0];
    expect(call.where.date).toEqual({ lt: new Date('2026-11-20T00:00:00Z') });
    expect(call.take).toBe(20);
    expect(call.orderBy).toEqual({ date: 'desc' });
  });

  it('reads the first page without a cursor', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findUserSubmissionsPage('w1', 'BS23001', null, 20);

    const call = db.sprintSubmission.findMany.mock.calls[0][0];
    expect(call.where.date).toBeUndefined();
  });

  it('asks only for the open tasks that were not carried forward', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findCarryCandidates('w1', 'BS23001', new Date('2026-11-23T00:00:00Z'));

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.done).toBe(false);
    expect(call.where.carriedFromId).toBeNull();
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.userId).toBe('BS23001');
  });

  it('asks the transactional carry candidates for the open tasks that were not carried forward', async () => {
    // The write path of the carry-forward uses this query, not the plain day's tasks: the
    // copy lands on the target day, so only a query that looks for "has this task been the
    // source of a copy" can stop the same task being carried twice.
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findCarryCandidatesTx(
      { sprintTask: db.sprintTask } as never,
      'w1',
      'BS23001',
      new Date('2026-11-22T00:00:00Z'),
    );

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.done).toBe(false);
    expect(call.where.carriedFromId).toBeNull();
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.userId).toBe('BS23001');
    expect(call.where.workspaceId).toBe('w1');
    // The source of a copy is left out: a task that was carried already is not carried again.
    expect(call.where.sprintTasksAsCarriedFrom).toEqual({ none: {} });
  });

  it('looks for the next meeting from now on, for a team of the caller', async () => {
    const { repository, db } = makeRepository();
    db.dsMeeting.findFirst.mockResolvedValue(null);
    const from = new Date('2026-11-23T04:00:00Z');

    await repository.findNextMeeting('w1', 'BS23001', from);

    const call = db.dsMeeting.findFirst.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('w1');
    expect(call.where.scheduledAt).toEqual({ gte: from });
    expect(call.orderBy).toEqual({ scheduledAt: 'asc' });
  });

  it('soft-deletes a task by setting deletedAt, never by removing the row', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.update.mockResolvedValue({});
    const deletedAt = new Date('2026-11-23T04:00:00Z');

    await repository.softDeleteTask('task-1', deletedAt);

    expect(db.sprintTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1' },
        data: { deletedAt },
      }),
    );
  });

  it('runs a transaction through the Prisma client', async () => {
    const { repository } = makeRepository();
    const work = vi.fn(async () => 'done');

    const result = await repository.transaction(work);

    expect(result).toBe('done');
  });
});

describe('SprintRepository.copyTaskIfNotCarried', () => {
  /** A source task the copy is made from. */
  const source = {
    id: 'task-1',
    title: 'Fix the login bug',
    description: 'auth module',
    plannedHours: 2,
    blocker: 'waiting for the API key',
    category: null,
    ownerId: null,
    verification: null,
    ownerRequestedAt: null,
  };

  /** A transaction handle whose savepoint creates the copy. */
  const makeTx = () => {
    const create = vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'copy-1' }));
    const tx = {
      sprintTask: { create },
      $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(tx)),
    };
    return { tx, create };
  };

  it('writes the copy with a pointer back at the task it came from', async () => {
    const { repository } = makeRepository();
    const { tx, create } = makeTx();

    await repository.copyTaskIfNotCarried(tx as never, {
      workspaceId: 'w1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      source,
    });

    const call = create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data.carriedFromId).toBe('task-1');
    expect(call.data.workspaceId).toBe('w1');
    expect(call.data.userId).toBe('BS23001');
    expect(call.data.date).toEqual(new Date('2026-11-23T00:00:00Z'));
  });

  it('writes the copy in a savepoint, so one refused copy does not undo the others', async () => {
    // The unique index on `carriedFromId` refuses a second copy of the same source task. The
    // insert has to be in a savepoint, or the failed insert would abort the whole
    // transaction and undo the copies that already succeeded.
    const { repository } = makeRepository();
    const { tx } = makeTx();

    await repository.copyTaskIfNotCarried(tx as never, {
      workspaceId: 'w1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      source,
    });

    expect(tx.$transaction).toHaveBeenCalled();
  });

  it('answers null when the unique index refuses the copy', async () => {
    // The task was carried by somebody else in the meantime. That is the idempotency rule
    // working, not a failure, so the answer is null and the task is left out.
    const { repository } = makeRepository();
    const tx = {
      sprintTask: { create: vi.fn() },
      $transaction: vi.fn(async () => {
        throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      }),
    };

    const result = await repository.copyTaskIfNotCarried(tx as never, {
      workspaceId: 'w1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      source,
    });

    expect(result).toBeNull();
  });

  it('lets any other database failure through', async () => {
    // A real failure must not be dressed up as the idempotency rule: it is a 500.
    const { repository } = makeRepository();
    const tx = {
      sprintTask: { create: vi.fn() },
      $transaction: vi.fn(async () => {
        throw new Error('connection lost');
      }),
    };

    await expect(
      repository.copyTaskIfNotCarried(tx as never, {
        workspaceId: 'w1',
        userId: 'BS23001',
        date: new Date('2026-11-23T00:00:00Z'),
        source,
      }),
    ).rejects.toThrow('connection lost');
  });
});
