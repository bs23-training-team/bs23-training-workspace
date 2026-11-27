import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTaskDto, UpdateTaskDto, HistoryQueryDto } from './sprint.dto.js';
import { SaveCellDto, OwnerReplyDto, CreateSprintWeekDto } from './pm-sprint.dto.js';

/**
 * The DTO rules are business rules of the PRD, so they are tested like any other rule:
 * - a task's hours are >= 0,
 * - a category is 'LND' or 'SBU',
 * - a day is a real calendar date in the form YYYY-MM-DD,
 * - the page size is at most 100 (SRS 5.2),
 * - `expectedVersion` is 0 or more: 0 means the cell has no stored row yet (DS-06.8).
 */

const errorsFor = async (dto: object): Promise<string[]> => {
  const errors = await validate(plainToInstance(dto.constructor as new () => object, dto));
  return errors.map((error) => error.property);
};

describe('CreateTaskDto', () => {
  const valid = {
    title: 'Fix the login bug',
    description: 'auth module',
    date: '2026-11-23',
    plannedHours: 2,
  };

  it('accepts a task for oneself: no category and no owner', async () => {
    expect(await errorsFor(Object.assign(new CreateTaskDto(), valid))).toEqual([]);
  });

  it('accepts an L&D task: a category and an owner', async () => {
    const dto = Object.assign(new CreateTaskDto(), {
      ...valid,
      category: 'LND',
      ownerId: 'owner-1',
    });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses a title that is empty or only spaces', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, title: '   ' });
    expect(await errorsFor(dto)).toContain('title');
  });

  it('refuses negative hours', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, plannedHours: -1 });
    expect(await errorsFor(dto)).toContain('plannedHours');
  });

  it('refuses more than one decimal place, because the column is Decimal(4,1)', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, plannedHours: 1.25 });
    expect(await errorsFor(dto)).toContain('plannedHours');
  });

  it('refuses a day that is not YYYY-MM-DD', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, date: '23-11-2026' });
    expect(await errorsFor(dto)).toContain('date');
  });

  it('refuses a day that does not exist', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, date: '2026-02-30' });
    expect(await errorsFor(dto)).toContain('date');
  });

  it('refuses a category that is not LND or SBU', async () => {
    const dto = Object.assign(new CreateTaskDto(), { ...valid, category: 'SBO' });
    expect(await errorsFor(dto)).toContain('category');
  });
});

describe('UpdateTaskDto', () => {
  it('accepts an empty body: nothing to change is not an error by itself', async () => {
    expect(await errorsFor(new UpdateTaskDto())).toEqual([]);
  });

  it('refuses a done flag that is not a boolean', async () => {
    const dto = Object.assign(new UpdateTaskDto(), { done: 'yes' });
    expect(await errorsFor(dto)).toContain('done');
  });

  it('refuses negative actual hours', async () => {
    const dto = Object.assign(new UpdateTaskDto(), { actualHours: -0.5 });
    expect(await errorsFor(dto)).toContain('actualHours');
  });
});

describe('HistoryQueryDto', () => {
  it('accepts a limit of 100 and refuses 101', async () => {
    expect(await errorsFor(Object.assign(new HistoryQueryDto(), { limit: 100 }))).toEqual([]);
    expect(await errorsFor(Object.assign(new HistoryQueryDto(), { limit: 101 }))).toContain('limit');
  });

  it('refuses a limit of 0 or a negative one', async () => {
    expect(await errorsFor(Object.assign(new HistoryQueryDto(), { limit: 0 }))).toContain('limit');
    expect(await errorsFor(Object.assign(new HistoryQueryDto(), { limit: -5 }))).toContain('limit');
  });

  it('accepts no limit at all: the service uses the default of 20', async () => {
    expect(await errorsFor(new HistoryQueryDto())).toEqual([]);
  });
});

describe('SaveCellDto', () => {
  const valid = {
    weekId: 'w1',
    userId: 'BS23001',
    date: '2026-11-23',
    column: 'TODAY',
    value: 'writing the report',
    expectedVersion: 0,
  };

  it('accepts a first edit: expectedVersion 0 means no stored row yet', async () => {
    expect(await errorsFor(Object.assign(new SaveCellDto(), valid))).toEqual([]);
  });

  it('refuses a column that is not a sheet column', async () => {
    const dto = Object.assign(new SaveCellDto(), { ...valid, column: 'NOTES' });
    expect(await errorsFor(dto)).toContain('column');
  });

  it('refuses a negative expectedVersion', async () => {
    const dto = Object.assign(new SaveCellDto(), { ...valid, expectedVersion: -1 });
    expect(await errorsFor(dto)).toContain('expectedVersion');
  });
});

describe('OwnerReplyDto', () => {
  it('accepts the two decisions and refuses anything else', async () => {
    expect(await errorsFor(Object.assign(new OwnerReplyDto(), { decision: 'VERIFIED' }))).toEqual([]);
    expect(await errorsFor(Object.assign(new OwnerReplyDto(), { decision: 'NOT_CONFIRMED' }))).toEqual([]);
    expect(await errorsFor(Object.assign(new OwnerReplyDto(), { decision: 'PENDING' }))).toContain('decision');
  });
});

describe('CreateSprintWeekDto', () => {
  it('accepts a Monday', async () => {
    const dto = Object.assign(new CreateSprintWeekDto(), { teamId: 't1', weekStart: '2026-11-23' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses a day that is not a Monday at the DTO level is not checked here: the service owns that rule', async () => {
    // The day format is checked here; "is it a Monday" is a business rule the service answers
    // with 422 WEEK_START_NOT_MONDAY, because it is also a database CHECK.
    const dto = Object.assign(new CreateSprintWeekDto(), { teamId: 't1', weekStart: '2026-11-24' });
    expect(await errorsFor(dto)).toEqual([]);
  });

  it('refuses a day that does not exist', async () => {
    const dto = Object.assign(new CreateSprintWeekDto(), { teamId: 't1', weekStart: '2026-02-30' });
    expect(await errorsFor(dto)).toContain('weekStart');
  });
});
