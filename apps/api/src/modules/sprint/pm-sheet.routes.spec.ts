import { ConfigService } from '@nestjs/config';
import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import ExcelJS from 'exceljs';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { PmSheetController } from './pm-sheet.controller.js';
import { PmSheetService } from './pm-sheet.service.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintActorGuard } from './http/actor.guard.js';
import { CLOCK } from './time/clock.port.js';

/**
 * Route-level tests for the PM's team sheet.
 *
 * Real HTTP requests (supertest) through the REAL `PmSheetController`, the REAL E01
 * `JwtAuthGuard` and `RolesGuard`, the REAL sprint actor guard, the REAL validation pipe and
 * the REAL error filters. Only the database is fake.
 *
 * The token is real: it is signed with the real `JwtService` and checked against a fake
 * session row, exactly as E01's guard does it in production.
 */

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka. */
const NOW = new Date('2026-11-23T04:00:00Z');

const WORKSPACE = 'w1';
const USER_ID = 'BS23001';
const PM_ID = 'PM001';

const team = (overrides: Record<string, unknown> = {}) => ({
  id: 'team-1',
  name: 'Team A',
  pmId: PM_ID,
  archivedAt: null,
  ...overrides,
});

const week = (overrides: Record<string, unknown> = {}) => ({
  id: 'week-1',
  workspaceId: WORKSPACE,
  teamId: 'team-1',
  weekStart: new Date('2026-11-23T00:00:00Z'),
  createdAt: new Date('2026-11-23T00:00:00Z'),
  updatedAt: new Date('2026-11-23T00:00:00Z'),
  team: { name: 'Team A', pmId: PM_ID },
  ...overrides,
});

const membership = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  leftAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  user: { name: 'A User', archivedAt: null },
  ...overrides,
});

const storedCell = (overrides: Record<string, unknown> = {}) => ({
  id: 'cell-1',
  weekId: 'week-1',
  userId: USER_ID,
  date: new Date('2026-11-23T00:00:00Z'),
  column: 'PLAN',
  value: 'Finish the auth module',
  version: 3,
  authorPmId: PM_ID,
  authorUserId: null,
  updatedByPmId: PM_ID,
  updatedByUserId: null,
  createdAt: new Date('2026-11-23T00:00:00Z'),
  updatedAt: new Date('2026-11-23T00:00:00Z'),
  ...overrides,
});

const makeRepository = () => ({
  findTeam: vi.fn<(args: unknown) => Promise<unknown>>(async () => team()),
  findSprintWeeks: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [week()]),
  findSprintWeek: vi.fn<(args: unknown) => Promise<unknown>>(async () => week()),
  findSprintWeekByStart: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  createSprintWeek: vi.fn<(args: unknown) => Promise<unknown>>(async () => week()),
  findTeamMembers: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [membership()]),
  findTasksForSheet: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findSheetCells: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findSheetCell: vi.fn<(args: unknown) => Promise<unknown>>(async () => storedCell()),
  saveSheetCellIfVersion: vi.fn<
    (tx: unknown, cellId: string, expectedVersion: number, data: unknown) => Promise<unknown>
  >(async () => ({ count: 1 })),
  createSheetCell: vi.fn<(args: unknown) => Promise<unknown>>(async () =>
    storedCell({ version: 1 }),
  ),
  createSheetCellVersion: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({ id: 'v1' })),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(
    async (work) => work({} as never),
  ),
});

let app: INestApplication;
let repository: ReturnType<typeof makeRepository>;
let jwt: JwtService;
let sessions: Map<string, { kind: 'pm' | 'user'; id: string; workspaceId: string }>;

/** Signs a real access token and registers the session it belongs to. */
const tokenFor = async (kind: 'pm' | 'user', id: string): Promise<string> => {
  const sid = `session-${kind}-${id}`;
  sessions.set(sid, { kind, id, workspaceId: WORKSPACE });
  return jwt.sign({ sub: id, sid }, { secret: 'a'.repeat(40), expiresIn: '15m' });
};

beforeAll(async () => {
  sessions = new Map();
  jwt = new JwtService();
  repository = makeRepository();

  const fakePrisma = {
    session: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        if (!session) return null;
        if (session.kind === 'pm') {
          return {
            id: where.id,
            pmId: session.id,
            userId: null,
            workspaceId: session.workspaceId,
            endedAt: null,
            expiresAt: new Date(Date.now() + 3_600_000),
            pm: {
              pmId: session.id,
              workspaceId: session.workspaceId,
              name: 'A PM',
              email: 'pm@bs23.test',
              mustChangePassword: false,
              emailVerified: true,
            },
            user: null,
          };
        }
        return {
          id: where.id,
          pmId: null,
          userId: session.id,
          workspaceId: session.workspaceId,
          endedAt: null,
          expiresAt: new Date(Date.now() + 3_600_000),
          pm: null,
          user: {
            userId: session.id,
            workspaceId: session.workspaceId,
            name: 'A User',
            email: 'user@bs23.test',
            mustChangePassword: false,
            emailVerified: true,
            resource: 'TRAINEE',
            pmId: PM_ID,
            archivedAt: null,
            departureDate: null,
          },
        };
      },
    },
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [PmSheetController],
    providers: [
      PmSheetService,
      { provide: SprintRepository, useValue: repository },
      { provide: PrismaService, useValue: fakePrisma },
      {
        provide: ConfigService,
        useValue: new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(40) }),
      },
      { provide: JwtService, useValue: jwt },
      { provide: CLOCK, useValue: { now: () => NOW } },
      SprintActorGuard,
      JwtAuthGuard,
      RolesGuard,
      Reflector,
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

beforeEach(() => {
  // `resetAllMocks` and not `clearAllMocks`: a test that stubs a query with another row
  // must not leave that implementation behind for the next test.
  vi.resetAllMocks();
  repository.findTeam.mockResolvedValue(team());
  repository.findSprintWeeks.mockResolvedValue([week()]);
  repository.findSprintWeek.mockResolvedValue(week());
  repository.findSprintWeekByStart.mockResolvedValue(null);
  repository.createSprintWeek.mockResolvedValue(week());
  repository.findTeamMembers.mockResolvedValue([membership()]);
  repository.findTasksForSheet.mockResolvedValue([]);
  repository.findSheetCells.mockResolvedValue([]);
  repository.findSheetCell.mockResolvedValue(storedCell());
  repository.saveSheetCellIfVersion.mockResolvedValue({ count: 1 });
  repository.createSheetCell.mockResolvedValue(storedCell({ version: 1 }));
  repository.createSheetCellVersion.mockResolvedValue({ id: 'v1' });
  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work({} as never),
  );
});

describe('GET /pm/sprint/weeks (P1) — who is allowed in', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer()).get('/pm/sprint/weeks?teamId=team-1').expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks?teamId=team-1')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 for a user: the sheet is a PM page', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks?teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 401 with a token that is not signed by us', async () => {
    const forged = jwt.sign({ sub: PM_ID, sid: 'session-pm-PM001' }, { secret: 'wrong' });

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks?teamId=team-1')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('answers 422 when the team is missing', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });
});

describe('GET /pm/sprint/weeks (P1) — the HTTP contract', () => {
  it('answers 200 with the weeks of the team', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks?teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: 'week-1',
        teamId: 'team-1',
        teamName: 'Team A',
        weekStart: '2026-11-23',
        weekEnd: '2026-11-29',
      }),
    ]);
  });

  it('answers 403 for a team of another PM', async () => {
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks?teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });
});

describe('POST /pm/sprint/weeks (P2) — the HTTP contract', () => {
  it('answers 201 with the new week', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-11-23' })
      .expect(201);

    expect(response.body).toMatchObject({
      id: 'week-1',
      teamId: 'team-1',
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
    });
  });

  it('answers 422 when the week does not start on a Monday', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-11-24' })
      .expect(422);

    expect(response.body.error.code).toBe('WEEK_START_NOT_MONDAY');
  });

  it('answers 422 when the day is not a real calendar date', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-02-30' })
      .expect(422);
  });

  it('answers 409 when the team already has a week for that Monday', async () => {
    repository.findSprintWeekByStart.mockResolvedValue({ id: 'week-1' });
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-11-23' })
      .expect(409);

    expect(response.body.error.code).toBe('WEEK_EXISTS');
  });

  it('answers 403 for a team of another PM', async () => {
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-11-23' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('answers 401 without a token', async () => {
    await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .send({ teamId: 'team-1', weekStart: '2026-11-23' })
      .expect(401);
  });
});

describe('GET /pm/sprint/weeks/:id/sheet (P3) — the HTTP contract', () => {
  it('answers 200 with the grid', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/sheet')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      weekId: 'week-1',
      teamId: 'team-1',
      teamName: 'Team A',
      weekStart: '2026-11-23',
      weekEnd: '2026-11-29',
      columns: ['YESTERDAY', 'HOURS', 'TODAY', 'BLOCKERS', 'PLAN'],
    });
    expect(response.body.rows).toHaveLength(1);
  });

  it('answers 403 for a week of another PM', async () => {
    repository.findSprintWeek.mockResolvedValue(
      week({ team: { name: 'Team A', pmId: 'PM002' } }),
    );
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/sheet')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('answers 404 for a week that does not exist', async () => {
    repository.findSprintWeek.mockResolvedValue(null);
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/sheet')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('answers 403 for a user', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/sheet')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});

describe('PUT /pm/sprint/cells (P4) — the HTTP contract', () => {
  const cellBody = (overrides: Record<string, unknown> = {}) => ({
    weekId: 'week-1',
    userId: USER_ID,
    date: '2026-11-23',
    column: 'PLAN',
    value: 'Finish the auth module',
    expectedVersion: 3,
    ...overrides,
  });

  it('answers 200 with the saved cell and its new version', async () => {
    repository.findSheetCell.mockResolvedValueOnce(storedCell()).mockResolvedValueOnce(
      storedCell({ value: 'Finish the auth module', version: 4 }),
    );
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody())
      .expect(200);

    expect(response.body).toMatchObject({
      weekId: 'week-1',
      userId: USER_ID,
      date: '2026-11-23',
      column: 'PLAN',
      version: 4,
    });
  });

  it('answers 409 when somebody else changed the cell first', async () => {
    repository.findSheetCell.mockResolvedValue(storedCell({ version: 4 }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody())
      .expect(409);

    expect(response.body.error.code).toBe('CELL_CONFLICT');
  });

  it('tells the UI what the cell says now, so the conflict dialog can show it', async () => {
    repository.findSheetCell.mockResolvedValue(storedCell({ version: 4, value: 'Their text' }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody())
      .expect(409);

    expect(response.body.error.details).toMatchObject({
      expectedVersion: 3,
      currentVersion: 4,
      currentValue: 'Their text',
    });
  });

  it('answers 422 when the column is not one of the five', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody({ column: 'MAYBE' }))
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 422 when the expected version is missing', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send({
        weekId: 'week-1',
        userId: USER_ID,
        date: '2026-11-23',
        column: 'PLAN',
        value: 'A note',
      })
      .expect(422);
  });

  it('answers 422 when the expected version is negative', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody({ expectedVersion: -1 }))
      .expect(422);
  });

  it('answers 403 for a cell of somebody who is not a member of the team', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody({ userId: 'BS99999' }))
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('answers 401 without a token', async () => {
    await request(app.getHttpServer()).put('/pm/sprint/cells').send(cellBody()).expect(401);
  });

  it('answers 403 for a user', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody())
      .expect(403);
  });

  it('turns an unexpected failure into a 500 in the shared envelope', async () => {
    repository.findSprintWeek.mockRejectedValue(new Error('the database is on fire'));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send(cellBody())
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).not.toContain('on fire');
  });
});

describe('The sheet routes — the caller can never be spoofed', () => {
  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/sheet')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-pm', 'PM999')
      .set('x-actor-role', 'PM')
      .set('x-workspace-id', 'other-workspace')
      .expect(200);

    // The scope is the workspace of the token.
    expect(repository.findSprintWeek).toHaveBeenCalledWith(WORKSPACE, 'week-1');
  });

  it('ignores a pmId in the body of a week', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/weeks')
      .set('Authorization', `Bearer ${token}`)
      .send({ teamId: 'team-1', weekStart: '2026-11-23', pmId: 'PM999' })
      .expect(201);

    const call = repository.createSprintWeek.mock.calls[0];
    if (!call) throw new Error('the week was never written');
    expect(call[0]).toMatchObject({ workspaceId: WORKSPACE });
  });

  it('ignores a pmId in the body of a cell', async () => {
    // No stored cell yet, so this is the first edit and the cell is created.
    repository.findSheetCell.mockResolvedValue(null);
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .put('/pm/sprint/cells')
      .set('Authorization', `Bearer ${token}`)
      .send({
        weekId: 'week-1',
        userId: USER_ID,
        date: '2026-11-23',
        column: 'PLAN',
        value: 'A note',
        expectedVersion: 0,
        pmId: 'PM999',
      })
      .expect(200);

    // The PM who wrote it is the one who is signed in.
    const call = repository.createSheetCell.mock.calls[0];
    if (!call) throw new Error('the cell was never written');
    expect(call[0]).toMatchObject({ authorPmId: PM_ID });
  });
});

describe('GET /pm/sprint/weeks/:id/export (P5) — the XLSX', () => {
  /**
   * A parser that hands the body over as a Buffer.
   *
   * supertest parses a response as JSON when it can, and an XLSX is a zip — so without this
   * the test would see a mangled object instead of the file.
   */
  const binaryParser = (
    res: { on: (event: string, listener: (chunk: Buffer) => void) => unknown },
    callback: (error: Error | null, body: Buffer) => void,
  ): void => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  };

  it('answers 200 with a workbook', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    // The XLSX format is a zip: the body starts with "PK".
    expect(response.body.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('answers a workbook that can be opened again', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('the workbook has no worksheet');
    expect(worksheet.getCell(1, 1).value).toBe('Team A — sprint week 2026-11-23 to 2026-11-29');
  });

  it('answers it as a file download, not as JSON', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain(
      'sprint-week-2026-11-23.xlsx',
    );
  });

  it('answers 403 for a week of another PM', async () => {
    repository.findSprintWeek.mockResolvedValue(
      week({ team: { name: 'Team A', pmId: 'PM002' } }),
    );
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('answers 401 without a token', async () => {
    await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .expect(401);
  });

  it('answers 403 for a user', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/weeks/week-1/export')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });
});
