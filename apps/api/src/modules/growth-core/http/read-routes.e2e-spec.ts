import { randomUUID } from 'node:crypto';
import type { IncomingMessage, RequestListener, Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../../../config/env.validation.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard.js';
import { GrowthCoreModule } from '../growth-core.module.js';
import { ensureTestJwtSecrets } from '../testing/test-env.js';
import { parseDay } from '../time/org-time.js';
import { XpLedgerService } from '../xp/xp-ledger.service.js';
import type { RequestUser } from './actor.js';

// GET /badges, GET /pm/growth-summary and the optional `kind` of POST /pm/badges, end to end with the real database.
// req.user is set by the test on the request (no header says who is calling); E01's guard is replaced by one that lets
// everything through. Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace. A and B belong to PM001, C to PM002 (a PM sees every active user: the directory's rule).

ensureTestJwtSecrets();

describe('read routes: badge catalogue and PM growth summary (database)', () => {
  const tag = randomUUID().slice(0, 6);
  const [A, B, C] = [`RRA${tag}`, `RRB${tag}`, `RRC${tag}`]; // names "Name RRA..." sort A, B, C
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let workspaceId: string;
  let seq = 0;

  const pm = (pmId = 'PM001'): RequestUser => ({ sub: pmId, sid: 'test-session', workspaceId, role: 'PM' });
  const trainee = (userId: string): RequestUser => ({ sub: userId, sid: 'test-session', workspaceId, role: 'TRAINEE' });
  const target = (user: RequestUser | null): RequestListener | Server => {
    if (!user) return app.getHttpServer() as Server;
    const handler = app.getHttpAdapter().getInstance() as RequestListener;
    return (req, res) => {
      (req as IncomingMessage & { user?: RequestUser }).user = user;
      handler(req, res);
    };
  };
  const as = (user: RequestUser | null) => ({
    get: (url: string) => request(target(user)).get(url),
    post: (url: string) => request(target(user)).post(url),
  });
  const errorCode = (res: request.Response) => (res.body as { error?: { code?: string } }).error?.code;

  const makeUser = (userId: string, pmId: string) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@read-routes-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
      },
    });
  const xp = (userId: string, amount: number, status: 'AWARDED' | 'PENDING' | 'HELD') =>
    ledger.createEvent({
      workspaceId,
      userId,
      source: 'MANUAL_ADJUSTMENT',
      amount,
      status,
      key: `manual:${userId}:${++seq}`,
      evidence: 'test XP',
      occurredOn: parseDay('2026-11-17'),
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, GrowthCoreModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    ledger = moduleRef.get(XpLedgerService);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Read routes test', slug: `t-read-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    await makeUser(A, 'PM001');
    await makeUser(B, 'PM001');
    await makeUser(C, 'PM002');
  });

  afterEach(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  describe('POST /pm/badges: kind is optional', () => {
    it('makes a badge with a rule Behavioral and a badge without one Special', async () => {
      const auto = await as(pm()).post('/pm/badges').send({ name: 'Streaker', icon: '🔥', criteria: '5 days', ruleType: 'SPRINT_STREAK', threshold: 5 });
      const manual = await as(pm()).post('/pm/badges').send({ name: 'Helper', icon: '🏅', criteria: 'Helps' });
      expect([auto.status, manual.status]).toEqual([201, 201]);
      const kinds = await prisma.badge.findMany({ where: { workspaceId }, select: { name: true, kind: true } });
      expect(kinds.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
        { name: 'Helper', kind: 'SPECIAL' },
        { name: 'Streaker', kind: 'BEHAVIORAL' },
      ]);
    });

    it('still refuses a kind that does not fit the rule', async () => {
      const a = await as(pm()).post('/pm/badges').send({ name: 'No rule', icon: '🏅', criteria: 'x', kind: 'BEHAVIORAL' });
      const b = await as(pm()).post('/pm/badges').send({ name: 'With rule', icon: '🏅', criteria: 'x', kind: 'SPECIAL', ruleType: 'SPRINT_STREAK', threshold: 3 });
      expect([a.status, errorCode(a)]).toEqual([422, 'BADGE_RULE']);
      expect([b.status, errorCode(b)]).toEqual([422, 'BADGE_RULE']);
      expect(await prisma.badge.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('GET /badges', () => {
    it('answers a user with their own view and a PM with the PM view', async () => {
      await as(pm()).post('/pm/badges').send({ name: 'Streaker', icon: '🔥', criteria: '5 days', ruleType: 'SPRINT_STREAK', threshold: 5 });
      const mine = await as(trainee(A)).get('/badges');
      expect(mine.status).toBe(200);
      expect(mine.body).toMatchObject({
        viewer: 'USER',
        nextCursor: null,
        badges: [{ name: 'Streaker', kind: 'BEHAVIORAL', rule: { type: 'SPRINT_STREAK', threshold: 5 }, mine: null, progress: { value: 0, threshold: 5 } }],
      });
      const all = await as(pm()).get('/badges');
      expect(all.body).toMatchObject({ viewer: 'PM', badges: [{ name: 'Streaker', awards: [] }] });
    });

    it('is refused without a sign-in and refuses a bad cursor', async () => {
      expect((await as(null).get('/badges')).status).toBe(401);
      const bad = await as(pm()).get('/badges?cursor=abc');
      expect([bad.status, errorCode(bad)]).toEqual([400, 'VALIDATION']);
    });
  });

  describe('GET /pm/growth-summary', () => {
    it('lists every active user by name with awarded XP, pending XP, level and the stored streak', async () => {
      await prisma.level.createMany({
        data: [
          { workspaceId, name: 'Rookie', minXp: 0 },
          { workspaceId, name: 'Builder', minXp: 100 },
        ],
      });
      await xp(A, 120, 'AWARDED');
      await xp(A, 30, 'PENDING');
      await xp(A, 20, 'HELD');
      await xp(B, 40, 'AWARDED');
      await prisma.streak.create({ data: { workspaceId, userId: A, current: 3, longest: 7 } });

      const res = await as(pm()).get('/pm/growth-summary');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        nextCursor: null,
        users: [
          { userId: A, name: `Name ${A}`, awardedXp: 120, pendingXp: 50, level: 'Builder', streak: { current: 3, longest: 7 } },
          { userId: B, name: `Name ${B}`, awardedXp: 40, pendingXp: 0, level: 'Rookie', streak: { current: 0, longest: 0 } },
          // C belongs to PM002 and is still listed: every PM sees every active user (the directory's rule)
          { userId: C, name: `Name ${C}`, awardedXp: 0, pendingXp: 0, level: 'Rookie', streak: { current: 0, longest: 0 } },
        ],
      });
    });

    it('does not list archived users, and counts only AWARDED XP in the total', async () => {
      await prisma.user.update({ where: { userId: B }, data: { archivedAt: new Date('2026-11-18T00:00:00Z') } });
      await xp(A, 50, 'AWARDED');
      await xp(A, 500, 'PENDING');
      const res = await as(pm()).get('/pm/growth-summary');
      const users = (res.body as { users: { userId: string; awardedXp: number }[] }).users;
      expect(users.map((u) => u.userId)).toEqual([A, C]);
      expect(users[0]?.awardedXp).toBe(50);
      await prisma.user.update({ where: { userId: B }, data: { archivedAt: null } });
    });

    it('is for PMs only and needs a sign-in', async () => {
      expect((await as(trainee(A)).get('/pm/growth-summary')).status).toBe(403);
      expect((await as(null).get('/pm/growth-summary')).status).toBe(401);
    });
  });
});
