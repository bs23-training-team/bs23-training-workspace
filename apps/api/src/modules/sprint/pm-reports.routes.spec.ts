import { ConfigService } from '@nestjs/config';
import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { PmReportsController } from './pm-reports.controller.js';
import { PmReportsService } from './pm-reports.service.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintActorGuard } from './http/actor.guard.js';

/**
 * Route-level tests for the PM's sprint report (P6).
 *
 * Real HTTP requests (supertest) through the REAL `PmReportsController`, the REAL E01
 * `JwtAuthGuard` and `RolesGuard`, the REAL sprint actor guard, the REAL validation pipe and
 * the REAL error filters. Only the database is fake.
 *
 * The token is real: it is signed with the real `JwtService` and checked against a fake
 * session row, exactly as E01's guard does it in production.
 */

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

const reportUser = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  name: 'A User',
  ...overrides,
});

const membership = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  leftAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  user: { userId: USER_ID, name: 'A User', pmId: PM_ID, archivedAt: null },
  ...overrides,
});

const task = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  date: new Date('2026-11-23T00:00:00Z'),
  plannedHours: 4,
  actualHours: 3,
  blocker: '',
  ...overrides,
});

const submission = (overrides: Record<string, unknown> = {}) => ({
  userId: USER_ID,
  date: new Date('2026-11-23T00:00:00Z'),
  onTime: true,
  ...overrides,
});

const makeRepository = () => ({
  findTeam: vi.fn<(args: unknown) => Promise<unknown>>(async () => team()),
  findReportUsers: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [reportUser()]),
  findReportTeamUsers: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => [membership()]),
  findReportTasks: vi.fn<
    (workspaceId: string, userIds: string[], from: Date, to: Date) => Promise<unknown[]>
  >(async () => [task()]),
  findReportSubmissions: vi.fn<
    (workspaceId: string, userIds: string[], from: Date, to: Date) => Promise<unknown[]>
  >(async () => [submission()]),
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
    controllers: [PmReportsController],
    providers: [
      PmReportsService,
      { provide: SprintRepository, useValue: repository },
      { provide: PrismaService, useValue: fakePrisma },
      {
        provide: ConfigService,
        useValue: new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(40) }),
      },
      { provide: JwtService, useValue: jwt },
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
  repository.findReportUsers.mockResolvedValue([reportUser()]);
  repository.findReportTeamUsers.mockResolvedValue([membership()]);
  repository.findReportTasks.mockResolvedValue([task()]);
  repository.findReportSubmissions.mockResolvedValue([submission()]);
});

describe('GET /pm/sprint/reports (P6) — who is allowed in', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 401 with a token that is not signed by us', async () => {
    const forged = jwt.sign({ sub: PM_ID, sid: 'session-pm-PM001' }, { secret: 'wrong' });

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('answers 403 for a user: the report is a PM page', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 403 for a user and reads nothing', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(repository.findReportUsers).not.toHaveBeenCalled();
    expect(repository.findReportTasks).not.toHaveBeenCalled();
  });

  it('answers 403 FORBIDDEN_SCOPE for a team of another PM', async () => {
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('reads nothing for a team of another PM', async () => {
    repository.findTeam.mockResolvedValue(team({ pmId: 'PM002' }));
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(repository.findReportTeamUsers).not.toHaveBeenCalled();
    expect(repository.findReportTasks).not.toHaveBeenCalled();
    expect(repository.findReportSubmissions).not.toHaveBeenCalled();
  });
});

describe('GET /pm/sprint/reports (P6) — the query is validated', () => {
  it('answers 422 when the type is missing', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('answers 422 when the type is not one of the four', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=yearly&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 422 when the date is missing', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('answers 422 when the date is not a real calendar date', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-02-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('answers 422 when the date is not a day string', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=23-11-2026')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('answers 422 when the team id is too long', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get(`/pm/sprint/reports?type=daily&date=2026-11-23&teamId=${'t'.repeat(65)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });
});

describe('GET /pm/sprint/reports (P6) — the HTTP contract', () => {
  it('answers 200 with the report', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      type: 'daily',
      date: '2026-11-23',
      from: '2026-11-23',
      to: '2026-11-23',
      teamId: null,
    });
    expect(response.body.rows).toHaveLength(1);
  });

  it('answers one row per user with every figure labelled', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows[0]).toEqual({
      userId: USER_ID,
      name: 'A User',
      plannedHours: { value: 4, source: 'TASK' },
      actualHours: { value: 3, source: 'TASK' },
      taskCount: { value: 1, source: 'TASK' },
      submittedDays: { value: 1, source: 'SUBMISSION' },
      onTimeDays: { value: 1, source: 'SUBMISSION' },
      blockers: [],
    });
  });

  it('answers a missing figure as missing, never as a zero', async () => {
    repository.findReportTasks.mockResolvedValue([]);
    repository.findReportSubmissions.mockResolvedValue([]);
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows[0].plannedHours).toEqual({ value: null, source: 'MISSING' });
    expect(response.body.rows[0].submittedDays).toEqual({ value: null, source: 'MISSING' });
  });

  it('answers a real zero as a zero', async () => {
    repository.findReportTasks.mockResolvedValue([
      task({ plannedHours: 0, actualHours: 0 }),
    ]);
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows[0].plannedHours).toEqual({ value: 0, source: 'TASK' });
  });

  it('answers the weekly window of the report week, Sunday to Friday', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=weekly&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The report week of Monday 2026-11-23 runs Sunday 2026-11-22 to Friday 2026-11-27.
    expect(response.body.from).toBe('2026-11-22');
    expect(response.body.to).toBe('2026-11-27');
  });

  it('answers the biweekly window of the two report weeks', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=biweekly&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // The week of 2026-11-22 and the week of 2026-11-15 before it.
    expect(response.body.from).toBe('2026-11-15');
    expect(response.body.to).toBe('2026-11-27');
  });

  it('answers the monthly window of the calendar month', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=monthly&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.from).toBe('2026-11-01');
    expect(response.body.to).toBe('2026-11-30');
  });

  it('answers the team of a team report', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&teamId=team-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.teamId).toBe('team-1');
  });

  it('lists the blockers of the period', async () => {
    repository.findReportTasks.mockResolvedValue([task({ blocker: 'Waiting for the API key' })]);
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.rows[0].blockers).toEqual(['Waiting for the API key']);
  });

  it('turns an unexpected failure into a 500 in the shared envelope', async () => {
    repository.findReportUsers.mockRejectedValue(new Error('the database is on fire'));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).not.toContain('on fire');
  });
});

describe('GET /pm/sprint/reports (P6) — the caller can never be spoofed', () => {
  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-pm', 'PM999')
      .set('x-dev-user', 'BS99999')
      .set('x-actor-role', 'PM')
      .set('x-workspace-id', 'other-workspace')
      .expect(200);

    // The scope is the workspace and the PM of the token.
    expect(repository.findReportUsers).toHaveBeenCalledWith(WORKSPACE, PM_ID);
  });

  it('ignores a pmId in the query', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&pmId=PM999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(repository.findReportUsers).toHaveBeenCalledWith(WORKSPACE, PM_ID);
  });

  it('ignores a userId in the query', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&userId=BS99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const call = repository.findReportTasks.mock.calls[0];
    expect(call?.[1]).toEqual([USER_ID]);
  });

  it('ignores a workspaceId in the query', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/pm/sprint/reports?type=daily&date=2026-11-23&workspaceId=other-workspace')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(repository.findReportUsers).toHaveBeenCalledWith(WORKSPACE, PM_ID);
  });
});
