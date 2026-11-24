import type { PrismaService } from '../../prisma/prisma.service.js';
import { SprintRepository } from './sprint.repository.js';
import type { Db } from './ports/db.js';

/**
 * The queries of the PM's team sheet.
 *
 * Two things are under test here:
 *
 * - **the filters.** Every query carries the workspace, and the task query leaves out the
 *   deleted tasks: a task the user took back is not on the sheet (PRD BR-09).
 * - **the shape of the cell write.** The write is a conditional `updateMany` carrying the
 *   version the editor saw, so a cell that somebody else changed in the meantime is not
 *   overwritten. The count it returns is what tells the service "somebody else was faster".
 */

const makeRepository = () => {
  const db = {
    team: { findFirst: vi.fn() },
    sprintWeek: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    membership: { findMany: vi.fn() },
    sprintTask: { findMany: vi.fn() },
    dsSheetCell: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    dsSheetCellVersion: { create: vi.fn() },
  };
  const prisma = {
    ...db,
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(db)),
  } as unknown as PrismaService;
  const repository = new SprintRepository(prisma);
  return { repository, db, tx: db as unknown as Db };
};

describe('SprintRepository.findTeam', () => {
  it('looks the team up inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.team.findFirst.mockResolvedValue(null);

    await repository.findTeam('w1', 'team-1');

    expect(db.team.findFirst).toHaveBeenCalledWith({
      where: { id: 'team-1', workspaceId: 'w1' },
      select: { id: true, name: true, pmId: true, archivedAt: true },
    });
  });

  it('asks for the PM who manages the team, so the scope can be decided from the row', async () => {
    const { repository, db } = makeRepository();
    db.team.findFirst.mockResolvedValue(null);

    await repository.findTeam('w1', 'team-1');

    const call = db.team.findFirst.mock.calls[0][0];
    expect(call.select.pmId).toBe(true);
  });
});

describe('SprintRepository.findSprintWeeks', () => {
  it('scopes the weeks to the workspace and the team', async () => {
    const { repository, db } = makeRepository();
    db.sprintWeek.findMany.mockResolvedValue([]);

    await repository.findSprintWeeks('w1', 'team-1');

    expect(db.sprintWeek.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1', teamId: 'team-1' },
        orderBy: { weekStart: 'desc' },
      }),
    );
  });
});

describe('SprintRepository.findSprintWeek', () => {
  it('looks the week up inside the workspace', async () => {
    const { repository, db } = makeRepository();
    db.sprintWeek.findFirst.mockResolvedValue(null);

    await repository.findSprintWeek('w1', 'week-1');

    expect(db.sprintWeek.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'week-1', workspaceId: 'w1' },
      }),
    );
  });

  it('asks for the PM of the team, so the scope can be decided from the row', async () => {
    const { repository, db } = makeRepository();
    db.sprintWeek.findFirst.mockResolvedValue(null);

    await repository.findSprintWeek('w1', 'week-1');

    const call = db.sprintWeek.findFirst.mock.calls[0][0];
    expect(call.select.team).toEqual({ select: { name: true, pmId: true } });
  });
});

describe('SprintRepository.findSprintWeekByStart', () => {
  it('looks the week up by the team and the Monday', async () => {
    const { repository, db } = makeRepository();
    db.sprintWeek.findFirst.mockResolvedValue(null);
    const weekStart = new Date('2026-11-23T00:00:00Z');

    await repository.findSprintWeekByStart('w1', 'team-1', weekStart);

    expect(db.sprintWeek.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1', teamId: 'team-1', weekStart },
      }),
    );
  });
});

describe('SprintRepository.createSprintWeek', () => {
  it('writes the week with the workspace of the caller', async () => {
    const { repository, db } = makeRepository();
    db.sprintWeek.create.mockResolvedValue({ id: 'week-1' });

    await repository.createSprintWeek({
      workspaceId: 'w1',
      teamId: 'team-1',
      weekStart: new Date('2026-11-23T00:00:00Z'),
    });

    const call = db.sprintWeek.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      workspaceId: 'w1',
      teamId: 'team-1',
      weekStart: new Date('2026-11-23T00:00:00Z'),
    });
  });
});

describe('SprintRepository.findTeamMembers', () => {
  it('scopes the members to the workspace and the team', async () => {
    const { repository, db } = makeRepository();
    db.membership.findMany.mockResolvedValue([]);

    await repository.findTeamMembers('w1', 'team-1');

    expect(db.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1', teamId: 'team-1' },
      }),
    );
  });

  it('asks for the day the user left, so a row can be shown only for the days they were there', async () => {
    const { repository, db } = makeRepository();
    db.membership.findMany.mockResolvedValue([]);

    await repository.findTeamMembers('w1', 'team-1');

    const call = db.membership.findMany.mock.calls[0][0];
    expect(call.select.leftAt).toBe(true);
  });
});

describe('SprintRepository.findTasksForSheet', () => {
  it('leaves out the deleted tasks', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findTasksForSheet(
      'w1',
      ['BS23001'],
      new Date('2026-11-22T00:00:00Z'),
      new Date('2026-11-29T00:00:00Z'),
    );

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
  });

  it('scopes the tasks to the workspace, the users and the days', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findTasksForSheet(
      'w1',
      ['BS23001'],
      new Date('2026-11-22T00:00:00Z'),
      new Date('2026-11-29T00:00:00Z'),
    );

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.where.workspaceId).toBe('w1');
    expect(call.where.userId).toEqual({ in: ['BS23001'] });
    expect(call.where.date).toEqual({
      gte: new Date('2026-11-22T00:00:00Z'),
      lte: new Date('2026-11-29T00:00:00Z'),
    });
  });

  it('asks for the verification, so a pending task can be marked', async () => {
    const { repository, db } = makeRepository();
    db.sprintTask.findMany.mockResolvedValue([]);

    await repository.findTasksForSheet(
      'w1',
      ['BS23001'],
      new Date('2026-11-22T00:00:00Z'),
      new Date('2026-11-29T00:00:00Z'),
    );

    const call = db.sprintTask.findMany.mock.calls[0][0];
    expect(call.select.verification).toBe(true);
  });
});

describe('SprintRepository.findSheetCells', () => {
  it('scopes the cells to the workspace and the week', async () => {
    const { repository, db } = makeRepository();
    db.dsSheetCell.findMany.mockResolvedValue([]);

    await repository.findSheetCells('w1', 'week-1');

    expect(db.dsSheetCell.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 'w1', weekId: 'week-1' },
      }),
    );
  });
});

describe('SprintRepository.findSheetCell', () => {
  it('looks the cell up by its natural key: the week, the user, the day and the column', async () => {
    const { repository, db } = makeRepository();
    db.dsSheetCell.findFirst.mockResolvedValue(null);
    const date = new Date('2026-11-23T00:00:00Z');

    await repository.findSheetCell('w1', 'week-1', 'BS23001', date, 'PLAN');

    expect(db.dsSheetCell.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'w1',
          weekId: 'week-1',
          userId: 'BS23001',
          date,
          column: 'PLAN',
        },
      }),
    );
  });
});

describe('SprintRepository.saveSheetCellIfVersion — the optimistic lock', () => {
  it('changes the row only while it is still at the version the editor saw', async () => {
    const { repository, db, tx } = makeRepository();
    db.dsSheetCell.updateMany.mockResolvedValue({ count: 1 });

    await repository.saveSheetCellIfVersion(tx, 'cell-1', 3, {
      value: 'New text',
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });

    expect(db.dsSheetCell.updateMany).toHaveBeenCalledWith({
      where: { id: 'cell-1', version: 3 },
      data: {
        value: 'New text',
        version: { increment: 1 },
        updatedByPmId: 'PM001',
        updatedByUserId: null,
      },
    });
  });

  it('never uses a plain update, which could overwrite a cell somebody else changed', async () => {
    const { repository, db, tx } = makeRepository();
    db.dsSheetCell.updateMany.mockResolvedValue({ count: 1 });

    await repository.saveSheetCellIfVersion(tx, 'cell-1', 3, {
      value: 'New text',
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });

    expect(db.dsSheetCell.update).not.toHaveBeenCalled();
  });

  it('goes up by exactly one version, so the client knows what to send next', async () => {
    const { repository, db, tx } = makeRepository();
    db.dsSheetCell.updateMany.mockResolvedValue({ count: 1 });

    await repository.saveSheetCellIfVersion(tx, 'cell-1', 3, {
      value: 'New text',
      updatedByPmId: null,
      updatedByUserId: null,
    });

    const call = db.dsSheetCell.updateMany.mock.calls[0][0];
    expect(call.data.version).toEqual({ increment: 1 });
  });

  it('reports how many rows it changed, so the service can tell a lost race', async () => {
    const { repository, db, tx } = makeRepository();
    db.dsSheetCell.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.saveSheetCellIfVersion(tx, 'cell-1', 3, {
      value: 'New text',
      updatedByPmId: null,
      updatedByUserId: null,
    });

    expect(result.count).toBe(0);
  });
});

describe('SprintRepository.createSheetCell', () => {
  it('writes the author and the updater, one of each — the XOR the database checks', async () => {
    const { repository, db } = makeRepository();
    db.dsSheetCell.create.mockResolvedValue({ id: 'cell-1' });

    await repository.createSheetCell({
      workspaceId: 'w1',
      weekId: 'week-1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      column: 'PLAN',
      value: 'A note',
      authorPmId: 'PM001',
      authorUserId: null,
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });

    const call = db.dsSheetCell.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      authorPmId: 'PM001',
      authorUserId: null,
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });
  });

  it('writes the week, the user, the day and the column', async () => {
    const { repository, db } = makeRepository();
    db.dsSheetCell.create.mockResolvedValue({ id: 'cell-1' });

    await repository.createSheetCell({
      workspaceId: 'w1',
      weekId: 'week-1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      column: 'PLAN',
      value: 'A note',
      authorPmId: 'PM001',
      authorUserId: null,
      updatedByPmId: 'PM001',
      updatedByUserId: null,
    });

    const call = db.dsSheetCell.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      weekId: 'week-1',
      userId: 'BS23001',
      date: new Date('2026-11-23T00:00:00Z'),
      column: 'PLAN',
    });
  });
});

describe('SprintRepository.createSheetCellVersion', () => {
  it('records the old value with the version it had', async () => {
    const { repository, db } = makeRepository();
    db.dsSheetCellVersion.create.mockResolvedValue({ id: 'version-1' });

    await repository.createSheetCellVersion({
      workspaceId: 'w1',
      cellId: 'cell-1',
      version: 3,
      value: 'The old text',
      editedByPmId: 'PM001',
      editedByUserId: null,
      editedAt: new Date('2026-11-23T04:00:00Z'),
    });

    const call = db.dsSheetCellVersion.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      workspaceId: 'w1',
      cellId: 'cell-1',
      version: 3,
      value: 'The old text',
      editedByPmId: 'PM001',
      editedByUserId: null,
    });
  });
});
