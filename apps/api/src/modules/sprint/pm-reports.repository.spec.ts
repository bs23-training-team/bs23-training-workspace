import type { PrismaService } from '../../prisma/prisma.service.js';
import { SprintRepository } from './sprint.repository.js';
import type { Db } from './ports/db.js';

/**
 * The queries of the PM's sprint report (P6).
 *
 * Three things are under test here:
 *
 * - **the filters.** Every query carries the workspace of the caller, and the task query
 *   leaves out the deleted tasks: a task the user took back is not work that happened
 *   (ASSUMPTIONS D9).
 * - **the membership query does not filter `leftAt`.** Only the service knows the period of
 *   the report, and a member who left **inside** the window still belongs to it.
 * - **the report only reads.** It writes nothing, so no create/update/delete is called.
 */

const makeRepository = () => {
  const db = {
    user: { findMany: vi.fn() },
    membership: { findMany: vi.fn() },
    sprintTask: { findMany: vi.fn() },
    sprintSubmission: { findMany: vi.fn() },
    team: { findFirst: vi.fn() },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  } as unknown as PrismaService;
  const repository = new SprintRepository(prisma);
  return { repository, db, tx: db as unknown as Db };
};

describe('SprintRepository.findReportUsers', () => {
  it('asks for the users the PM manages, and nobody else', async () => {
    const { repository, db } = makeRepository();
    db.user.findMany.mockResolvedValue([]);

    await repository.findReportUsers('w1', 'PM001');

    expect(db.user.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'w1', pmId: 'PM001', archivedAt: null },
      orderBy: { userId: 'asc' },
      select: { userId: true, name: true },
    });
  });

  it('leaves out the archived users', async () => {
    const { repository, db } = makeRepository();
    db.user.findMany.mockResolvedValue([]);

    await repository.findReportUsers('w1', 'PM001');

    const call = db.user.findMany.mock.calls[0][0];
    expect(call.where.archivedAt).toBeNull();
  });
});

describe('SprintRepository.findReportTeamUsers', () => {
  it('asks for the members of the team inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.membership.findMany.mockResolvedValue([]);

    await repository.findReportTeamUsers('w1', 'team-1');

    expect(db.membership.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'w1', teamId: 'team-1' },
      orderBy: { userId: 'asc' },
      select: {
        userId: true,
        leftAt: true,
        user: { select: { userId: true, name: true, pmId: true, archivedAt: true } },
      },
    });
  });

  it('does not filter by leftAt, so a member who left inside the window is still there', async () => {
    const { repository, db } = makeRepository();
    db.membership.findMany.mockResolvedValue([]);

    await repository.findReportTeamUsers('w1', 'team-1');

    const call = db.membership.findMany.mock.calls[0][0];
    expect(call.where).not.toHaveProperty('leftAt');
  });

  it('asks for the member\'s own PM and archive state, so the scope can be decided', async () => {
    const { repository, db } = makeRepository();
    db.membership.findMany.mockResolvedValue([]);

    await repository.findReportTeamUsers('w1', 'team-1');

    const call = db.membership.findMany.mock.calls[0][0];
    expect(call.select.user.select.pmId).toBe(true);
    expect(call.select.user.select.archivedAt).toBe(true);
  });
});

describe('SprintRepository.findReportTasks', () => {
  const from = new Date('2026-11-23T00:00:00Z');
  const to = new Date('2026-11-29T00:00:00Z');

  it('asks for the tasks of the users inside the window', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findReportTasks('w1', ['BS23001'], from, to);

    expect(db.sprintTask.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w1',
        userId: { in: ['BS23001'] },
        date: { gte: from, lte: to },
        deletedAt: null,
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: {
        userId: true,
        date: true,
        plannedHours: true,
        actualHours: true,
        blocker: true,
      },
    });
  });

  it('leaves out the deleted tasks', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findReportTasks('w1', ['BS23001'], from, to);

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
  });
});

describe('SprintRepository.findReportSubmissions', () => {
  const from = new Date('2026-11-23T00:00:00Z');
  const to = new Date('2026-11-29T00:00:00Z');

  it('asks for the submissions of the users inside the window', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findReportSubmissions('w1', ['BS23001'], from, to);

    expect(db.sprintSubmission.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'w1',
        userId: { in: ['BS23001'] },
        date: { gte: from, lte: to },
      },
      orderBy: { date: 'asc' },
      select: { userId: true, date: true, onTime: true },
    });
  });

  it('asks for the frozen on-time flag', async () => {
    const { repository, db } = makeRepository();
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findReportSubmissions('w1', ['BS23001'], from, to);

    const call = db.sprintSubmission.findMany.mock.calls[0][0];
    expect(call.select.onTime).toBe(true);
  });
});

describe('The report queries — the caller\'s workspace and read-only', () => {
  /** The four report queries, each with the mock it is watched through. */
  const calls = (db: ReturnType<typeof makeRepository>['db']) => [
    {
      name: 'findReportUsers',
      run: (repository: SprintRepository) => repository.findReportUsers('w1', 'PM001'),
      mock: db.user.findMany,
    },
    {
      name: 'findReportTeamUsers',
      run: (repository: SprintRepository) => repository.findReportTeamUsers('w1', 'team-1'),
      mock: db.membership.findMany,
    },
    {
      name: 'findReportTasks',
      run: (repository: SprintRepository) =>
        repository.findReportTasks(
          'w1',
          ['BS23001'],
          new Date('2026-11-23T00:00:00Z'),
          new Date('2026-11-29T00:00:00Z'),
        ),
      mock: db.sprintTask.findMany,
    },
    {
      name: 'findReportSubmissions',
      run: (repository: SprintRepository) =>
        repository.findReportSubmissions(
          'w1',
          ['BS23001'],
          new Date('2026-11-23T00:00:00Z'),
          new Date('2026-11-29T00:00:00Z'),
        ),
      mock: db.sprintSubmission.findMany,
    },
  ];

  it.each(['findReportUsers', 'findReportTeamUsers', 'findReportTasks', 'findReportSubmissions'])(
    '%s carries the workspace of the caller',
    async (name) => {
      const { repository, db } = makeRepository();
      const entry = calls(db).find((row) => row.name === name);
      if (!entry) throw new Error(`no such query: ${name}`);
      entry.mock.mockResolvedValue([]);

      await entry.run(repository);

      const call = entry.mock.mock.calls[0]?.[0] as { where: { workspaceId: string } };
      expect(call.where.workspaceId).toBe('w1');
    },
  );

  it('never writes anything: the report only reads', async () => {
    const { repository, db } = makeRepository();
    db.user.findMany.mockResolvedValue([]);
    db.membership.findMany.mockResolvedValue([]);
    db.sprintTask.findMany.mockResolvedValue([]);
    db.sprintSubmission.findMany.mockResolvedValue([]);

    await repository.findReportUsers('w1', 'PM001');
    await repository.findReportTeamUsers('w1', 'team-1');
    await repository.findReportTasks(
      'w1',
      ['BS23001'],
      new Date('2026-11-23T00:00:00Z'),
      new Date('2026-11-29T00:00:00Z'),
    );
    await repository.findReportSubmissions(
      'w1',
      ['BS23001'],
      new Date('2026-11-23T00:00:00Z'),
      new Date('2026-11-29T00:00:00Z'),
    );

    // The report touches only read methods: there is no write method on the models it uses.
    for (const model of Object.values(db)) {
      for (const key of Object.keys(model)) {
        expect(key).not.toMatch(/^(create|update|delete|upsert|createMany|updateMany|deleteMany)/);
      }
    }
  });
});
