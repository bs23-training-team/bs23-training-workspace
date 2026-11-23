import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../../../config/env.validation.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GrowthCoreModule } from '../growth-core.module.js';
import { ensureTestJwtSecrets } from '../testing/test-env.js';
import { parseDay } from '../time/org-time.js';

// The growth-core routes with E01's REAL login and guard (nothing replaced): a PM and a trainee log in with
// a password, and the access token they get is what lets them call our routes. This is the check that our
// routes understand the req.user that E01's JwtAuthGuard really sets ({ sub, sid, workspaceId, role }).
// Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace with its own PM, trainee, credentials and sessions, removed afterwards.

ensureTestJwtSecrets(); // E01's IdentityModule needs JWT secrets to start

// Same password format as E01's password service (scrypt, "<hex salt>:<hex hash>"), the one the seed also uses.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
}

describe('growth-core HTTP routes with the real login (database, E01 guard)', () => {
  // E01 upper-cases a trainee id when it logs in, so the ids here are upper case.
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const PM = `TRLPM${tag}`;
  const PM_OTHER = `TRLPO${tag}`;
  const U1 = `TRLU1${tag}`;
  const pmEmail = `${PM.toLowerCase()}@real-login.invalid`;
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
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, GrowthCoreModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Real login test', slug: `t-rlogin-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    for (const pmId of [PM, PM_OTHER]) {
      await prisma.pm.create({ data: { pmId, workspaceId, email: pmId === PM ? pmEmail : `${pmId.toLowerCase()}@real-login.invalid`, name: `PM ${pmId}`, emailVerified: true } });
      await prisma.credential.create({ data: { workspaceId, pmId, passwordHash: hashPassword(password) } });
    }
    await prisma.user.create({
      data: {
        userId: U1,
        workspaceId,
        email: `${U1.toLowerCase()}@real-login.invalid`,
        name: `Name ${U1}`,
        resource: 'TRAINEE',
        pmId: PM,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        emailVerified: true,
      },
    });
    await prisma.credential.create({ data: { workspaceId, userId: U1, passwordHash: hashPassword(password) } });
  });

  afterAll(async () => {
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.session.deleteMany({ where: { workspaceId } });
    await prisma.authToken.deleteMany({ where: { workspaceId } });
    await prisma.credential.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.pm.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  it('refuses a caller with no token, on a PM route and on a user route: 401', async () => {
    expect((await http().get('/pm/xp-rules')).status).toBe(401);
    expect((await http().get('/me/growth')).status).toBe(401);
  });

  it('refuses a token that is not a real access token: 401', async () => {
    for (const authorization of ['Bearer not-a-token', 'Bearer ', 'Basic abc', 'garbage']) {
      expect((await http().get('/me/growth').set({ Authorization: authorization })).status).toBe(401);
    }
  });

  it('lets a trainee who logged in read their own growth: 200', async () => {
    const token = await login(U1);
    const res = await http().get('/me/growth').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ awardedXp: 0, pendingXp: 0 });
  });

  it('lets a PM who logged in read the XP rules of their workspace: 200', async () => {
    const token = await login(pmEmail);
    const res = await http().get('/pm/xp-rules').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ onTimeSprint: 20 });
  });

  it('keeps the roles with real tokens: a trainee on a PM route and a PM on a user route are 403', async () => {
    const traineeToken = await login(U1);
    const pmToken = await login(pmEmail);
    const a = await http().put('/pm/xp-rules').set(bearer(traineeToken)).send({ onTimeSprint: 99 });
    expect([a.status, errorCode(a)]).toEqual([403, 'FORBIDDEN']);
    const b = await http().get('/me/growth').set(bearer(pmToken));
    expect([b.status, errorCode(b)]).toEqual([403, 'FORBIDDEN']);
    expect((await prisma.xpRule.findFirstOrThrow({ where: { workspaceId } })).onTimeSprint).toBe(20);
  });

  it('acts as the person who logged in: the PM comes from the token, never from the body', async () => {
    const token = await login(pmEmail);
    const res = await http()
      .post('/pm/xp-adjustments')
      .set(bearer(token))
      .send({ userId: U1, amount: 5, reason: 'Real login check', pmId: PM_OTHER, workspaceId: randomUUID() });
    expect(res.status).toBe(201);
    const event = await prisma.xpEvent.findFirstOrThrow({ where: { workspaceId, userId: U1 } });
    expect(event.evidence).toContain(PM);
    expect(event.evidence).not.toContain(PM_OTHER);
  });

  it('keeps the PM scope with a real token: another PM cannot adjust this trainee', async () => {
    const token = await login(`${PM_OTHER.toLowerCase()}@real-login.invalid`);
    const res = await http().post('/pm/xp-adjustments').set(bearer(token)).send({ userId: U1, amount: 5, reason: 'Not my user' });
    expect([res.status, errorCode(res)]).toEqual([403, 'FORBIDDEN_SCOPE']);
  });

  it('does not let a forged header change who is calling: a trainee token with a PM header stays a trainee', async () => {
    const token = await login(U1);
    const forged = { 'x-test-actor': JSON.stringify({ role: 'PM', pmId: PM, workspaceId }), 'x-actor-pm-id': PM, 'x-workspace-id': workspaceId };
    const res = await http().get('/pm/xp-rules').set({ ...bearer(token), ...forged });
    expect([res.status, errorCode(res)]).toEqual([403, 'FORBIDDEN']);
  });

  it('stops working when the person logs out: the same token is 401 afterwards', async () => {
    const token = await login(U1);
    expect((await http().get('/me/growth').set(bearer(token))).status).toBe(200);
    expect((await http().post('/auth/logout').set(bearer(token))).status).toBeLessThan(300);
    expect((await http().get('/me/growth').set(bearer(token))).status).toBe(401);
  });
});
