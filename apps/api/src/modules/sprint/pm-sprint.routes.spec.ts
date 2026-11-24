import { ConfigService } from '@nestjs/config';
import { type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import { RolesGuard } from '../identity/guards/roles.guard.js';
import { PmSprintController } from './pm-sprint.controller.js';
import { PmSprintService } from './pm-sprint.service.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintActorGuard } from './http/actor.guard.js';
import { NOTIFICATIONS } from './ports/notification.port.js';
import { CLOCK } from './time/clock.port.js';

/**
 * Route-level tests for the PM side of the sprint module.
 *
 * Real HTTP requests (supertest) through the REAL `PmSprintController`, the REAL E01
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

/** A task of PM001's user, still waiting for its owner. */
const pendingTask = (overrides: Record<string, unknown> = {}) => ({
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
  category: 'LND',
  ownerId: 'owner-1',
  verification: 'PENDING',
  carriedFromId: null,
  ownerRequestedAt: new Date('2026-11-22T04:00:00Z'),
  createdAt: new Date('2026-11-22T04:00:00Z'),
  updatedAt: new Date('2026-11-22T04:00:00Z'),
  owner: { name: 'L&D team', email: 'lnd@example.test' },
  user: { pmId: PM_ID, name: 'A User' },
  ...overrides,
});

const makeRepository = () => ({
  findTaskForOwnerReply: vi.fn<(args: unknown) => Promise<unknown>>(async () => pendingTask()),
  findTaskById: vi.fn<(args: unknown) => Promise<unknown>>(async () =>
    pendingTask({ verification: 'VERIFIED' }),
  ),
  decideOwnerReply: vi.fn<(tx: unknown, taskId: string, data: Record<string, unknown>) => Promise<unknown>>(
    async () => ({ count: 1 }),
  ),
  findWorkspacesWithPendingTasks: vi.fn<(args: unknown) => Promise<unknown[]>>(async () => []),
  findStalePendingTasks: vi.fn<(workspaceId: string, askedBefore: Date) => Promise<unknown[]>>(
    async () => [],
  ),
  markPendingAlertSent: vi.fn<(tx: unknown, taskId: string, sentAt: Date) => Promise<unknown>>(
    async () => ({ count: 1 }),
  ),
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
    controllers: [PmSprintController],
    providers: [
      PmSprintService,
      { provide: SprintRepository, useValue: repository },
      { provide: PrismaService, useValue: fakePrisma },
      {
        provide: ConfigService,
        useValue: new ConfigService({ JWT_ACCESS_SECRET: 'a'.repeat(40) }),
      },
      { provide: JwtService, useValue: jwt },
      { provide: CLOCK, useValue: { now: () => NOW } },
      {
        provide: NOTIFICATIONS,
        useValue: { notifyPm: vi.fn(async () => undefined), notifyUser: vi.fn(async () => undefined) },
      },
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
  repository.findTaskForOwnerReply.mockResolvedValue(pendingTask());
  repository.findTaskById.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));
  repository.decideOwnerReply.mockResolvedValue({ count: 1 });
  repository.findWorkspacesWithPendingTasks.mockResolvedValue([]);
  repository.findStalePendingTasks.mockResolvedValue([]);
  repository.markPendingAlertSent.mockResolvedValue({ count: 1 });
  repository.transaction.mockImplementation(async (work: (tx: never) => Promise<unknown>) =>
    work({} as never),
  );
});

describe('POST /pm/sprint/tasks/:id/owner-reply (P7) — who is allowed in', () => {
  it('answers 401 without a token', async () => {
    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .send({ decision: 'VERIFIED' })
      .expect(401);
  });

  it('answers 401 in the shared envelope without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .send({ decision: 'VERIFIED' })
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 for a user: recording the answer is a PM action', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('answers 403 in the shared envelope for a user', async () => {
    const token = await tokenFor('user', USER_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(403);

    expect(response.body.error).toEqual({
      code: 'FORBIDDEN',
      message: expect.any(String),
    });
  });

  it('answers 401 with a token that is not signed by us', async () => {
    const forged = jwt.sign({ sub: PM_ID, sid: 'session-pm-PM001' }, { secret: 'wrong' });

    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${forged}`)
      .send({ decision: 'VERIFIED' })
      .expect(401);
  });
});

describe('POST /pm/sprint/tasks/:id/owner-reply (P7) — the HTTP contract', () => {
  it('answers 200 with the decided task', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'task-1',
      title: 'Fix the login bug',
      verification: 'VERIFIED',
    });
  });

  it('answers 422 when the decision is not VERIFIED or NOT_CONFIRMED', async () => {
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'MAYBE' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 422 when the body has no decision at all', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(422);
  });

  it('answers 404 in the shared envelope when the task does not exist', async () => {
    repository.findTaskForOwnerReply.mockResolvedValue(null);
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(404);

    expect(response.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No such task' },
    });
  });

  it('answers 403 in the shared envelope for a task of another PM\'s user', async () => {
    repository.findTaskForOwnerReply.mockResolvedValue(
      pendingTask({ user: { pmId: 'PM002', name: 'A User' } }),
    );
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN_SCOPE');
  });

  it('answers 409 in the shared envelope when the task was already decided', async () => {
    repository.findTaskForOwnerReply.mockResolvedValue(pendingTask({ verification: 'VERIFIED' }));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(409);

    expect(response.body.error.code).toBe('ALREADY_DECIDED');
  });

  it('answers 409 when somebody else decided the task first', async () => {
    // The row was still PENDING when it was read, but the conditional update changed
    // nothing: another PM was faster.
    repository.decideOwnerReply.mockResolvedValue({ count: 0 });
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(409);

    expect(response.body.error.code).toBe('ALREADY_DECIDED');
  });

  it('turns an unexpected failure into a 500 in the shared envelope', async () => {
    repository.findTaskForOwnerReply.mockRejectedValue(new Error('the database is on fire'));
    const token = await tokenFor('pm', PM_ID);

    const response = await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED' })
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL');
    expect(response.body.error.message).not.toContain('on fire');
  });
});

describe('POST /pm/sprint/tasks/:id/owner-reply (P7) — the caller can never be spoofed', () => {
  it('ignores an identity header entirely', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .set('x-dev-pm', 'PM999')
      .set('x-actor-role', 'PM')
      .set('x-workspace-id', 'other-workspace')
      .send({ decision: 'VERIFIED' })
      .expect(200);

    // The PM who recorded it is the one who is signed in.
    const call = repository.decideOwnerReply.mock.calls[0];
    if (!call) throw new Error('the decision was never written');
    const [, , data] = call;
    expect(data.ownerReplyById).toBe(PM_ID);
  });

  it('ignores a pmId in the body', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'VERIFIED', pmId: 'PM999', userId: 'BS99999' })
      .expect(200);

    // The scope is the workspace of the token.
    expect(repository.findTaskForOwnerReply).toHaveBeenCalledWith(WORKSPACE, 'task-1');
  });

  it('scopes the lookup to the caller\'s own workspace', async () => {
    const token = await tokenFor('pm', PM_ID);

    await request(app.getHttpServer())
      .post('/pm/sprint/tasks/task-1/owner-reply')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'NOT_CONFIRMED' })
      .expect(200);

    expect(repository.findTaskForOwnerReply).toHaveBeenCalledWith(WORKSPACE, 'task-1');
  });
});
