import type { PrismaService } from '../../prisma/prisma.service.js';
import { SprintRepository } from './sprint.repository.js';
import type { Db } from './ports/db.js';

/**
 * The queries of the PM side of the sprint module.
 *
 * Two things are under test here:
 *
 * - **the filters.** Every query carries the workspace, and the reply query carries the
 *   conditions that make "decided once" true: only a `PENDING` row is changed.
 * - **the shape of the decide-once write.** The decision is a conditional `updateMany`, not
 *   a plain `update`, so the row can only change while it is still pending. The count it
 *   returns is what tells the service "somebody else was faster".
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
      updateMany: vi.fn(),
    },
    sprintSubmission: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    xpRule: { findUnique: vi.fn() },
    dsMeeting: { findFirst: vi.fn() },
    workspace: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  } as unknown as PrismaService;
  const repository = new SprintRepository(prisma);
  return { repository, db, tx: db as unknown as Db };
};

describe('SprintRepository.findTaskForOwnerReply', () => {
  it('looks the task up inside the workspace, and only a task that is not deleted', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findFirst.mockResolvedValue(null);

    await repository.findTaskForOwnerReply('w1', 'task-1');

    expect(db.sprintTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task-1', workspaceId: 'w1', deletedAt: null },
      }),
    );
  });

  it('asks for the PM who manages the user, so the scope can be decided from the row', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findFirst.mockResolvedValue(null);

    await repository.findTaskForOwnerReply('w1', 'task-1');

    const call = db.sprintTask.findFirst.mock.calls[0][0];
    expect(call.select.user).toEqual({ select: { pmId: true, name: true } });
  });
});

describe('SprintRepository.decideOwnerReply — decided once', () => {
  it('changes the row only while it is still PENDING', async () => {
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 1 });

    await repository.decideOwnerReply(tx, 'task-1', {
      verification: 'VERIFIED',
      ownerRepliedAt: new Date('2026-11-23T04:00:00Z'),
      ownerReplyById: 'PM001',
    });

    expect(db.sprintTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', verification: 'PENDING' },
      data: {
        verification: 'VERIFIED',
        ownerRepliedAt: new Date('2026-11-23T04:00:00Z'),
        ownerReplyById: 'PM001',
      },
    });
  });

  it('writes the reply time and the PM together with the decision', async () => {
    // The database's own CHECK (chk_task_reply_state) requires a decided task to carry
    // both, so the write sets both or the database refuses it.
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 1 });

    await repository.decideOwnerReply(tx, 'task-1', {
      verification: 'NOT_CONFIRMED',
      ownerRepliedAt: new Date('2026-11-23T04:00:00Z'),
      ownerReplyById: 'PM001',
    });

    const call = db.sprintTask.updateMany.mock.calls[0][0];
    expect(call.data.ownerRepliedAt).toBeInstanceOf(Date);
    expect(call.data.ownerReplyById).toBe('PM001');
  });

  it('never uses a plain update, which could overwrite a decision that was already made', async () => {
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 1 });

    await repository.decideOwnerReply(tx, 'task-1', {
      verification: 'VERIFIED',
      ownerRepliedAt: new Date('2026-11-23T04:00:00Z'),
      ownerReplyById: 'PM001',
    });

    expect(db.sprintTask.update).not.toHaveBeenCalled();
  });

  it('reports how many rows it changed, so the service can tell a lost race', async () => {
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.decideOwnerReply(tx, 'task-1', {
      verification: 'VERIFIED',
      ownerRepliedAt: new Date('2026-11-23T04:00:00Z'),
      ownerReplyById: 'PM001',
    });

    expect(result.count).toBe(0);
  });
});

describe('SprintRepository.findWorkspacesWithPendingTasks', () => {
  it('asks only for the workspaces that have a task waiting past the window', async () => {
    const { repository, db } = makeRepository();
    db.workspace.findMany.mockResolvedValue([]);
    const askedBefore = new Date('2026-11-22T04:00:00Z');

    await repository.findWorkspacesWithPendingTasks(askedBefore);

    expect(db.workspace.findMany).toHaveBeenCalledWith({
      where: {
        sprintTasks: {
          some: {
            verification: 'PENDING',
            ownerRequestedAt: { lte: askedBefore },
            pendingAlertSentAt: null,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
  });
});

describe('SprintRepository.findStalePendingTasks', () => {
  /**
   * The SQL of the raw query.
   *
   * `$queryRaw` is a tagged template, so the first argument is the array of the template's
   * literal parts. The parts are joined with a placeholder so the statement reads like one
   * piece of SQL.
   */
  const sqlOf = (db: { $queryRaw: { mock: { calls: unknown[][] } } }): string => {
    const call = db.$queryRaw.mock.calls[0];
    if (!call) throw new Error('the query was never run');
    const parts = call[0] as unknown as ArrayLike<string>;
    return Array.from(parts).join('?');
  };

  it('asks only for the tasks that are still pending and were never escalated', async () => {
    const { repository, db } = makeRepository();
    db.$queryRaw.mockResolvedValue([]);

    await repository.findStalePendingTasks('w1', new Date('2026-11-22T04:00:00Z'));

    const sql = sqlOf(db);
    // The four conditions DS-09.1 names.
    expect(sql).toContain(`"verification" = 'PENDING'`);
    expect(sql).toContain(`"pendingAlertSentAt" IS NULL`);
    expect(sql).toContain(`"deletedAt" IS NULL`);
    expect(sql).toContain(`"ownerRequestedAt" IS NOT NULL`);
  });

  it('locks the rows it picks up, and skips the ones another run is holding', async () => {
    // Without SKIP LOCKED two runs of the job would pick up the same task and both would
    // try to escalate it (DS-09.3).
    const { repository, db } = makeRepository();
    db.$queryRaw.mockResolvedValue([]);

    await repository.findStalePendingTasks('w1', new Date('2026-11-22T04:00:00Z'));

    expect(sqlOf(db)).toContain('FOR UPDATE OF t SKIP LOCKED');
  });

  it('passes the workspace and the window as parameters, never as text', async () => {
    const { repository, db } = makeRepository();
    db.$queryRaw.mockResolvedValue([]);
    const askedBefore = new Date('2026-11-22T04:00:00Z');

    await repository.findStalePendingTasks('w1', askedBefore);

    const call = db.$queryRaw.mock.calls[0];
    expect(call[1]).toBe('w1');
    expect(call[2]).toBe(askedBefore);
  });

  it('joins the user and the owner, so the PM and the task title are known', async () => {
    const { repository, db } = makeRepository();
    db.$queryRaw.mockResolvedValue([]);

    await repository.findStalePendingTasks('w1', new Date('2026-11-22T04:00:00Z'));

    const sql = sqlOf(db);
    expect(sql).toContain('JOIN "User" u');
    expect(sql).toContain('LEFT JOIN "TaskOwner" o');
  });
});

describe('SprintRepository.markPendingAlertSent', () => {
  it('marks the task only while it has never been escalated', async () => {
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 1 });

    await repository.markPendingAlertSent(tx, 'task-1', new Date('2026-11-23T04:00:00Z'));

    expect(db.sprintTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', pendingAlertSentAt: null, verification: 'PENDING' },
      data: { pendingAlertSentAt: new Date('2026-11-23T04:00:00Z') },
    });
  });

  it('reports how many rows it changed, so the job can skip an already escalated task', async () => {
    const { repository, db, tx } = makeRepository();
    db.sprintTask.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.markPendingAlertSent(
      tx,
      'task-1',
      new Date('2026-11-23T04:00:00Z'),
    );

    expect(result.count).toBe(0);
  });
});
