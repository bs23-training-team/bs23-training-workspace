import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../../config/env.validation.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureTestJwtSecrets } from '../growth-core/testing/test-env.js';
import { parseDay } from '../growth-core/time/org-time.js';
import { EngagementModule } from './engagement.module.js';

// The engagement routes with E01's REAL login and guard (nothing replaced): a trainee and a PM log in with a
// password and the access token they get is what lets them call our routes. This is the check that engagement
// understands the req.user that E01's JwtAuthGuard really sets ({ sub, sid, workspaceId, role }).
// Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace with its own PMs, trainees, credentials and sessions, removed afterwards.

ensureTestJwtSecrets(); // growth-core imports E01's IdentityModule, which needs JWT secrets to start

// Same password format as E01's password service (scrypt, "<hex salt>:<hex hash>"), the one the seed also uses.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}

describe('engagement HTTP routes with the real login (database, E01 guard)', () => {
  // E01 upper-cases a trainee id when it logs in, so the ids here are upper case.
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const PM = `TERPM${tag}`;
  const [U1, U2] = [`TERU1${tag}`, `TERU2${tag}`];
  const pmEmail = `${PM.toLowerCase()}@eng-real-login.invalid`;
  const password = `${randomBytes(9).toString('hex')}Aa1!`;
  let app: INestApplication;
  let prisma: PrismaService;
  let workspaceId: string;

  const http = () => request(app.getHttpServer());
  const login = async (identifier: string): Promise<string> => {
    const res = await http().post('/auth/login').send({ identifier, password });
    expect(res.status, `login of ${identifier}: ${JSON.stringify(res.body)}`).toBe(200);
    return (res.body as { accessToken: string }).accessToken;
  };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const errorCode = (res: request.Response) => (res.body as { error?: { code?: string } }).error?.code;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, EngagementModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Engagement real login test', slug: `t-erlogin-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    await prisma.pm.create({ data: { pmId: PM, workspaceId, email: pmEmail, name: `PM ${PM}`, emailVerified: true } });
    await prisma.credential.create({ data: { workspaceId, pmId: PM, passwordHash: hashPassword(password) } });
    for (const userId of [U1, U2]) {
      await prisma.user.create({
        data: {
          userId,
          workspaceId,
          email: `${userId.toLowerCase()}@eng-real-login.invalid`,
          name: `Name ${userId}`,
          resource: 'TRAINEE',
          pmId: PM,
          position: 'BACKEND',
          attendanceMode: 'ONLINE',
          onboardDate: parseDay('2026-01-01'),
          emailVerified: true,
        },
      });
      await prisma.credential.create({ data: { workspaceId, userId, passwordHash: hashPassword(password) } });
    }
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.kudos.deleteMany({ where: { workspaceId } });
    await prisma.questProgress.deleteMany({ where: { workspaceId } });
    await prisma.quest.deleteMany({ where: { workspaceId } });
    await prisma.leaderboardPreference.deleteMany({ where: { workspaceId } });
    await prisma.session.deleteMany({ where: { workspaceId } });
    await prisma.authToken.deleteMany({ where: { workspaceId } });
    await prisma.credential.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.pm.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  it('refuses a caller with no token or a bad token, on every kind of route: 401', async () => {
    expect((await http().get('/leaderboard')).status).toBe(401);
    expect((await http().get('/quests')).status).toBe(401);
    expect((await http().post('/kudos').send({ toUserId: U2, category: 'HELPFUL', message: 'Thanks' })).status).toBe(401);
    expect((await http().get('/leaderboard').set({ Authorization: 'Bearer not-a-token' })).status).toBe(401);
  });

  it('lets a trainee who logged in read the leaderboard and see themself as "You": 200', async () => {
    const token = await login(U1);
    const res = await http().get('/leaderboard').set(bearer(token));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('You');
  });

  it('lets a PM who logged in read the leaderboard of their group: 200', async () => {
    const token = await login(pmEmail);
    expect((await http().get('/leaderboard').set(bearer(token))).status).toBe(200);
  });

  it('sends kudos as the person who logged in: the sender comes from the token, never from the body', async () => {
    const token = await login(U1);
    const res = await http()
      .post('/kudos')
      .set(bearer(token))
      .send({ toUserId: U2, category: 'HELPFUL', message: 'Thanks for the help', fromUserId: U2, userId: U2, workspaceId: randomUUID() });
    expect(res.status).toBe(201);
    const kudos = await prisma.kudos.findFirstOrThrow({ where: { workspaceId } });
    expect([kudos.fromUserId, kudos.toUserId]).toEqual([U1, U2]);
  });

  it('keeps the roles with real tokens: a PM cannot send kudos and a trainee cannot create quests', async () => {
    const pmToken = await login(pmEmail);
    const traineeToken = await login(U1);
    const a = await http().post('/kudos').set(bearer(pmToken)).send({ toUserId: U1, category: 'HELPFUL', message: 'x' });
    expect([a.status, errorCode(a)]).toEqual([403, 'FORBIDDEN']);
    const b = await http().post('/pm/quests').set(bearer(traineeToken)).send({});
    expect([b.status, errorCode(b)]).toEqual([403, 'FORBIDDEN']);
  });

  it('does not let a forged header change who is calling: a trainee token with a PM header stays a trainee', async () => {
    const token = await login(U1);
    const forged = { 'x-test-actor': JSON.stringify({ role: 'PM', pmId: PM, workspaceId }), 'x-actor-pm-id': PM, 'x-workspace-id': workspaceId };
    const res = await http().post('/pm/quests').set({ ...bearer(token), ...forged }).send({});
    expect([res.status, errorCode(res)]).toEqual([403, 'FORBIDDEN']);
  });

  it('stops working when the person logs out: the same token is 401 afterwards', async () => {
    const token = await login(U2);
    expect((await http().get('/leaderboard').set(bearer(token))).status).toBe(200);
    expect((await http().post('/auth/logout').set(bearer(token))).status).toBeLessThan(300);
    expect((await http().get('/leaderboard').set(bearer(token))).status).toBe(401);
  });
});
