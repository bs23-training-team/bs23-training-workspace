import { ConfigService } from '@nestjs/config';
import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { SprintController } from './sprint.controller.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintService } from './sprint.service.js';
import { SprintActorGuard } from './http/actor.guard.js';
import { APPROVAL_MAIL } from './ports/approval-mail.port.js';
import { CALENDAR } from './ports/calendar.port.js';
import { XP_LEDGER } from './ports/xp-ledger.port.js';
import { CLOCK } from './time/clock.port.js';
import { SprintError } from './errors.js';

/**
 * Route-level tests: real HTTP requests (supertest) through the REAL SprintController, the REAL
 * E01 `JwtAuthGuard` and `RolesGuard`, the REAL sprint actor guard, the REAL validation pipe and
 * the REAL error filters.
 *
 * Only the database is fake: the repository is stubbed, because the rules are covered by
 * `sprint.service.spec.ts` and the route tests are about the HTTP contract — who is allowed in,
 * what the error envelope looks like, and that the caller can never be spoofed.
 *
 * The token is real: it is signed with the real `JwtService` and checked against a fake
 * session row, exactly as E01's guard does it in production.
 */

/** 2026-11-23 04:00:00Z is 2026-11-23 10:00 in Dhaka. */
const NOW = new Date('2026-11-23T04:00:00Z');

const WORKSPACE = 'w1';
const USER_ID = 'BS23001';
const PM_ID = 'PM001';

/**
 * The fake repository.
 *
 * The mock functions are typed as `vi.fn<...>()` so a test can hand them a value of any shape:
 * without the type argument, `vi.fn(async () => null)` would only ever accept `null`, and a test
 * that stubs it with a row would not typecheck.
 */
const makeRepository = () => ({
  findUser: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({
    userId: USER_ID,
    name: 'A User',
    resource: 'TRAINEE',
    archivedAt: null,
  })),
  findActiveOwners: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findOwner: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  findUserTasksForDay: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findUserTasksForDayTx: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findCarryCandidates: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findOwnTask: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  createTask: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  updateTask: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  softDeleteTask: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  findUserTasksBetween: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findUserSubmissionsBetween: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findUserSubmissionsPage: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findUserTasksOfDayTx: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findCarryCandidatesTx: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findNextMeeting: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  findXpRule: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({
    sprintCutoff: '10:00',
    onTimeSprint: 20,
  })),
  findSubmission: vi.fn<(args: unknown) => Promise<unknown>>(async () => null),
  createSubmission: vi.fn<(args: unknown) => Promise<unknown>>(async () => ({})),
  createSubmissionTx: vi.fn<(tx: unknown, data: Record<string, unknown>) => Promise<unknown>>(
    async () => ({
      id: 'submission-1',
      date: new Date('2026-11-23T00:00:00Z'),
      submittedAt: NOW,
      onTime: false,
    }),
  ),
  transaction: vi.fn<(work: (tx: never) => Promise<unknown>) => Promise<unknown>>(
    async (work) =>
      work({
        sprintTask: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'task-new',
            workspaceId: WORKSPACE,
            userId: USER_ID,
            date: new Date('2026-11-23T00:00:00Z'),
            title: data.title,
            description: data.description,
            plannedHours: data.plannedHours,
            actualHours: data.actualHours,
            blocker: data.blocker,
            done: false,
            category: data.category,
            ownerId: data.ownerId,
            verification: data.verification,
            carriedFromId: null,
            ownerRequestedAt: data.ownerRequestedAt,
            createdAt: NOW,
            updatedAt: NOW,
            owner: null,
          })),
        },
        sprintSubmission: {
          create: vi.fn(async () => ({
            id: 'submission-1',
            date: new Date('2026-11-23T00:00:00Z'),
            submittedAt: NOW,
            onTime: false,
          })),
        },
        outboxEvent: { create: vi.fn(async () => ({ id: 'outbox-1' })) },
      } as never),
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
    controllers: [SprintController],
    providers: [
      SprintService,
      { provide: SprintRepository, useValue: repository },
      { provide: PrismaService, useValue: fakePrisma },
      { provide: ConfigService, useValue: new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(40) }) },
      { provide: JwtService, useValue: jwt },
      { provide: CLOCK, useValue: { now: () => NOW } },
      {
        provide: CALENDAR,
        useValue: {
          previousWorkingDay: vi.fn(async () => '2026-11-22'),
          isWorkingDay: vi.fn(async () => true),
        },
      },
      { provide: APPROVAL_MAIL, useValue: { requestOwnerApproval: vi.fn(async () => undefined) } },
      { provide: XP_LEDGER, useValue: { awardOnTimeSprint: vi.fn(async () => undefined) } },
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
  // `resetAllMocks` and not `clearAllMocks`: a test that stubs `findUser` with an archived
  // user must not leave that implementation behind for the next test.
  vi.resetAllMocks();
  repository.findUser.mockResolvedValue({
    userId: USER_ID,
    name: 'A User',
    resource: 'TRAINEE',
    archivedAt: null,
  });
  repository.findActiveOwners.mockResolvedValue([]);
  repository.findOwner.mockResolvedValue(null);
  repository.findUserTasksForDay.mockResolvedValue([]);
  repository.findUserTasksForDayTx.mockResolvedValue([]);
  repository.findCarryCandidates.mockResolvedValue([]);
  repository.findOwnTask.mockResolvedValue(null);
  repository.findUserTasksBetween.mockResolvedValue([]);
  repository.findUserSubmissionsBetween.mockResolvedValue([]);
  repository.findUserSubmissionsPage.mockResolvedValue([]);
  repository.findUserTasksOfDayTx.mockResolvedValue([]);
  repository.findCarryCandidatesTx.mockResolvedValue([]);
  repository.findNextMeeting.mockResolvedValue(null);
  repository.findXpRule.mockResolvedValue({ sprintCutoff: '10:00', onTimeSprint: 20 });
  repository.findSubmission.mockResolvedValue(null);
  repository.createTask.mockResolvedValue({});
  repository.updateTask.mockResolvedValue({});
  repository.softDeleteTask.mockResolvedValue({});
  repository.createSubmission.mockResolvedValue({});
  repository.createSubmissionTx.mockResolvedValue({
    id: 'submission-1',
    date: new Date('2026-11-23T00:00:00Z'),
    submittedAt: NOW,
    onTime: false,
  });
  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work({
      sprintTask: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'task-new',
          workspaceId: WORKSPACE,
          userId: USER_ID,
          date: new Date('2026-11-23T00:00:00Z'),
          title: data.title,
          description: data.description,
          plannedHours: data.plannedHours,
          actualHours: data.actualHours,
          blocker: data.blocker,
          done: false,
          category: data.category,
          ownerId: data.ownerId,
          verification: data.verification,
          carriedFromId: null,
          ownerRequestedAt: data.ownerRequestedAt,
          createdAt: NOW,
          updatedAt: NOW,
          owner: null,
        })),
      },
      sprintSubmission: {
        create: vi.fn(async () => ({
          id: 'submission-1',
          date: new Date('2026-11-23T00:00:00Z'),
          submittedAt: NOW,
          onTime: false,
        })),
      },
      outboxEvent: { create: vi.fn(async () => ({ id: 'outbox-1' })) },
    } as never),
  );
});

describe('Sprint routes — who is allowed in', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer()).get('/sprint/board').expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer()).get('/sprint/board').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(typeof response.body.error.message).toBe('string');
  });

  it('answers 401 with a token that is not signed by us', async () => {
    const forged = jwt.sign({ sub: USER_ID, sid: 'session-user-BS23001' }, { secret: 'wrong' });
    await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('answers 401 when the token has no live session', async () => {
    const token = jwt.sign({ sub: USER_ID, sid: 'session-gone' }, { secret: 'a'.repeat(40) });
    await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('answers 403 for a PM on a user-only route', async () => {
    const token = await tokenFor('pm', PM_ID);
    await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('answers 403 in the shared envelope for a PM', async () => {
    const token = await tokenFor('pm', PM_ID);
    const response = await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 200 for a signed-in user', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  });
});

describe('Sprint routes — the caller can never be spoofed', () => {
  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-user', 'BS99999')
      .set('x-dev-pm', PM_ID)
      .set('x-actor-role', 'PM')
      .set('x-workspace-id', 'other-workspace')
      .expect(200);

    // The queries still use the id from the token, not the header.
    expect(repository.findUserTasksForDay).toHaveBeenCalledWith(
      WORKSPACE,
      USER_ID,
      expect.any(Date),
    );
  });

  it('ignores a userId in the body', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: 'BS99999',
        title: 'A task',
        description: 'for myself',
        date: '2026-11-23',
        plannedHours: 1,
      })
      .expect(201);

    expect(repository.findUser).toHaveBeenCalledWith(WORKSPACE, USER_ID);
  });
});

describe('Sprint routes — the error envelope', () => {
  it('answers 404 in the shared envelope when the task is not the caller\'s', async () => {
    repository.findOwnTask.mockResolvedValue(null);
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .patch('/sprint/tasks/task-9')
      .set('Authorization', `Bearer ${token}`)
      .send({ done: true })
      .expect(404);

    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No such task' },
    });
  });

  it('answers 422 in the shared envelope when a rule refuses the request', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A task',
        description: 'for an owner',
        date: '2026-11-23',
        plannedHours: 1,
        category: 'LND',
      })
      .expect(422);

    expect(response.body.error.code).toBe('CATEGORY_OWNER_MISMATCH');
    expect(typeof response.body.error.message).toBe('string');
  });

  it('answers 422 in the shared envelope when the body fails validation', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '', description: 'x', date: '2026-02-30', plannedHours: -1 })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 404 when the sprint error carries a details object', async () => {
    repository.findOwnTask.mockResolvedValue(null);
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .delete('/sprint/tasks/task-9')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    expect(response.body.error).toEqual({ code: 'NOT_FOUND', message: 'No such task' });
  });
});

describe('Sprint routes — the endpoints', () => {
  it('GET /sprint/task-owners needs a kind', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/task-owners')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('GET /sprint/task-owners refuses a kind that is not LND or SBU', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/task-owners?kind=SBO')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('GET /sprint/task-owners answers the list', async () => {
    repository.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', name: 'L&D team', kind: 'LND', email: 'lnd@example.test' },
    ]);
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/task-owners?kind=LND')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual([
      { id: 'owner-1', name: 'L&D team', kind: 'LND', email: 'lnd@example.test' },
    ]);
  });

  it('GET /sprint/board answers the day and the tasks', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/board?date=2026-11-23')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.date).toBe('2026-11-23');
    expect(response.body.tasks).toEqual([]);
    expect(response.body.carryCandidates).toEqual([]);
  });

  it('GET /sprint/board refuses a day that is not a real date', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/board?date=2026-02-30')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('POST /sprint/tasks answers 201 and the task', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Fix the login bug',
        description: 'auth module',
        date: '2026-11-23',
        plannedHours: 2,
      })
      .expect(201);

    expect(response.body.title).toBe('Fix the login bug');
    expect(response.body.category).toBeNull();
    expect(response.body.verification).toBeNull();
  });

  it('POST /sprint/tasks drops a field the module does not accept', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Fix the login bug',
        description: 'auth module',
        date: '2026-11-23',
        plannedHours: 2,
        workspaceId: 'other-workspace',
        userId: 'BS99999',
      })
      .expect(201);

    // The client-supplied identity fields are not part of the task.
    expect(response.body.workspaceId).toBeUndefined();
    expect(response.body.userId).toBeUndefined();
  });

  it('PATCH /sprint/tasks/:id answers 200 and the task', async () => {
    repository.findOwnTask.mockResolvedValue({
      id: 'task-1',
      workspaceId: WORKSPACE,
      userId: USER_ID,
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
      createdAt: NOW,
      updatedAt: NOW,
      owner: null,
    });
    repository.updateTask.mockResolvedValue({
      id: 'task-1',
      workspaceId: WORKSPACE,
      userId: USER_ID,
      date: new Date('2026-11-23T00:00:00Z'),
      title: 'Fix the login bug',
      description: 'auth module',
      plannedHours: 2,
      actualHours: 3,
      blocker: '',
      done: true,
      category: null,
      ownerId: null,
      verification: null,
      carriedFromId: null,
      ownerRequestedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      owner: null,
    });
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .patch('/sprint/tasks/task-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ done: true, actualHours: 3 })
      .expect(200);

    expect(response.body.done).toBe(true);
    expect(response.body.actualHours).toBe(3);
  });

  it('DELETE /sprint/tasks/:id answers 204', async () => {
    repository.findOwnTask.mockResolvedValue({
      id: 'task-1',
      workspaceId: WORKSPACE,
      userId: USER_ID,
      date: new Date('2026-11-23T00:00:00Z'),
      title: 'A task',
      description: '',
      plannedHours: 1,
      actualHours: 0,
      blocker: '',
      done: false,
      category: null,
      ownerId: null,
      verification: null,
      carriedFromId: null,
      ownerRequestedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      owner: null,
    });
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .delete('/sprint/tasks/task-1')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('POST /sprint/carry-forward answers the carried tasks', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/carry-forward')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-11-23' })
      .expect(200);

    expect(response.body).toEqual({ carried: [] });
  });

  it('POST /sprint/carry-forward refuses a day that is not a real date', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .post('/sprint/carry-forward')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-13-01' })
      .expect(422);
  });

  it('GET /sprint/summary answers the two-week window', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.from).toBe('2026-11-10');
    expect(response.body.to).toBe('2026-11-23');
    expect(response.body.days).toHaveLength(14);
  });

  it('GET /sprint/history answers the list and its cursor', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/history?limit=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ data: [], meta: { nextCursor: null } });
  });

  it('GET /sprint/history refuses a limit above 100', async () => {
    const token = await tokenFor('user', USER_ID);
    await request(app.getHttpServer())
      .get('/sprint/history?limit=500')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);
  });

  it('GET /sprint/meeting answers null when there is no meeting', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/meeting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({ meeting: null });
  });

  it('GET /sprint/meeting answers the next meeting', async () => {
    repository.findNextMeeting.mockResolvedValue({
      id: 'meeting-1',
      title: 'Daily stand-up',
      scheduledAt: new Date('2026-11-23T05:30:00Z'),
      teamsLink: 'https://teams.example.test/1',
      source: 'teams',
    });
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/meeting')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
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
});

describe('GET /sprint/meeting (U10) — who is allowed in', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer()).get('/sprint/meeting').expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer()).get('/sprint/meeting').expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 for a PM: the banner is a user page', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/meeting')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('reads nothing for a PM', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .get('/sprint/meeting')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(repository.findNextMeeting).not.toHaveBeenCalled();
  });

  it('looks for the meeting of the signed-in user, never for a client-supplied one', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .get('/sprint/meeting?userId=BS99999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(repository.findNextMeeting).toHaveBeenCalledWith(WORKSPACE, USER_ID, NOW);
  });

  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .get('/sprint/meeting')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-user', 'BS99999')
      .set('x-actor-role', 'TRAINEE')
      .set('x-workspace-id', 'other-workspace')
      .expect(200);

    expect(repository.findNextMeeting).toHaveBeenCalledWith(WORKSPACE, USER_ID, NOW);
  });
});

describe('Sprint routes — the service rules still hold behind the HTTP layer', () => {
  it('refuses an archived user with 422', async () => {
    repository.findUser.mockResolvedValue({
      userId: USER_ID,
      name: 'A User',
      resource: 'TRAINEE',
      archivedAt: new Date('2026-11-01T00:00:00Z'),
    });
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A task',
        description: 'for myself',
        date: '2026-11-23',
        plannedHours: 1,
      })
      .expect(422);

    expect(response.body.error.code).toBe('USER_ARCHIVED');
  });

  it('refuses an inactive owner with 422', async () => {
    repository.findOwner.mockResolvedValue({
      id: 'owner-1',
      name: 'An old team',
      kind: 'LND',
      email: 'old@example.test',
      isActive: false,
    });
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A task',
        description: 'for an owner',
        date: '2026-11-23',
        plannedHours: 1,
        category: 'LND',
        ownerId: 'owner-1',
      })
      .expect(422);

    expect(response.body.error.code).toBe('OWNER_INACTIVE');
  });

  it('turns an unexpected failure into a 500 in the shared envelope', async () => {
    repository.findUserTasksForDay.mockRejectedValue(new Error('the database is on fire'));
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .get('/sprint/board')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);

    // The message of an unexpected error never leaks.
    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).not.toContain('on fire');
  });
});

describe('POST /sprint/submit (U7) — the HTTP contract', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer()).post('/sprint/submit').expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer()).post('/sprint/submit').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 for a PM', async () => {
    const token = await tokenFor('pm', PM_ID);
    const response = await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 201 with the day, the instant and the frozen flag', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(response.body).toEqual({
      date: '2026-11-23',
      submittedAt: '2026-11-23T04:00:00.000Z',
      onTime: false,
      xpAwarded: 0,
    });
  });

  it('never takes the day or the user from the request', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-01-01', userId: 'BS99999', workspaceId: 'other' })
      .expect(201);

    // The submission is the caller's, for the caller's own today.
    const call = repository.createSubmissionTx.mock.calls[0];
    if (!call) throw new Error('the submission was never written');
    const data = call[1];
    expect(data.userId).toBe(USER_ID);
    expect(data.workspaceId).toBe(WORKSPACE);
    expect((data.date as Date).toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });

  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('user', USER_ID);

    await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-user', 'BS99999')
      .set('x-actor-role', 'PM')
      .set('x-workspace-id', 'other-workspace')
      .expect(201);

    const call = repository.createSubmissionTx.mock.calls[0];
    if (!call) throw new Error('the submission was never written');
    const data = call[1];
    expect(data.userId).toBe(USER_ID);
    expect(data.workspaceId).toBe(WORKSPACE);
  });

  it('answers 409 in the shared envelope when the day was already submitted', async () => {
    repository.createSubmissionTx.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    expect(response.body).toEqual({
      error: {
        code: 'ALREADY_SUBMITTED',
        message: 'You have already submitted your sprint for today',
      },
    });
  });

  it('answers 422 for an archived user', async () => {
    repository.findUser.mockResolvedValue({
      userId: USER_ID,
      name: 'A User',
      resource: 'TRAINEE',
      archivedAt: new Date('2026-11-01T00:00:00Z'),
    });
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(422);

    expect(response.body.error.code).toBe('USER_ARCHIVED');
  });

  it('turns an unexpected failure into a 500 in the shared envelope', async () => {
    repository.findXpRule.mockRejectedValue(new Error('the database is on fire'));
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/sprint/submit')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).not.toContain('on fire');
  });
});

describe('SprintError — the codes the module can answer with', () => {
  it('carries the code and the details', () => {
    const error = new SprintError('CELL_CONFLICT', 'Someone else changed it', {
      version: 3,
    });
    expect(error.code).toBe('CELL_CONFLICT');
    expect(error.details).toEqual({ version: 3 });
    expect(error).toBeInstanceOf(Error);
  });
});
