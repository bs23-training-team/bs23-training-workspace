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

// The growth-core HTTP routes, end to end with the real database. E01's JwtAuthGuard is replaced by a guard that lets
// everything through, and the test sets req.user itself on the request in the shape E01's guard produces
// ({ sub, sid, workspaceId, role }); no header is ever used to say who is calling. The real login is in real-login.e2e-spec.
// Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace; U1 and U2 belong to PM001, X1 to PM002.

ensureTestJwtSecrets(); // the module imports E01's IdentityModule, which needs JWT secrets to start

describe('growth-core HTTP routes (database, req.user set by the test)', () => {
  const tag = randomUUID().slice(0, 6);
  const [U1, U2, X1] = [`THU1${tag}`, `THU2${tag}`, `THX1${tag}`];
  let app: INestApplication;
  let prisma: PrismaService;
  let ledger: XpLedgerService;
  let workspaceId: string;

  // req.user as E01's JwtAuthGuard sets it: sub is the Pm.pmId or User.userId, every User has the role TRAINEE.
  const pm = (pmId = 'PM001'): RequestUser => ({ sub: pmId, sid: 'test-session', workspaceId, role: 'PM' });
  const user = (userId: string): RequestUser => ({ sub: userId, sid: 'test-session', workspaceId, role: 'TRAINEE' });
  // Test-only: the request reaches the app with req.user already set (no header, no shared state). null = nobody signed in.
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
    put: (url: string) => request(target(user)).put(url),
  });
  const errorCode = (res: request.Response) => (res.body as { error?: { code?: string } }).error?.code;

  const makeUser = (userId: string, pmId: string) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@http-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
      },
    });
  const pendingEvent = async (userId: string, amount = 20) =>
    (
      await ledger.createEvent({
        workspaceId,
        userId,
        source: 'ON_TIME_SPRINT',
        amount,
        key: `sprint:${userId}:${randomUUID().slice(0, 8)}`.replace(/:(\d)/, ':x$1'),
        evidence: 'test sprint',
        occurredOn: parseDay('2026-11-17'),
      })
    ).event.id;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, GrowthCoreModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true }) // the real guard is exercised in real-login.e2e-spec
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    ledger = moduleRef.get(XpLedgerService);
    workspaceId = (await prisma.workspace.create({ data: { name: 'HTTP test', slug: `t-http-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    await makeUser(U1, 'PM001');
    await makeUser(U2, 'PM001');
    await makeUser(X1, 'PM002');
  });

  afterEach(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.streakFreeze.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
  });

  afterAll(async () => {
    await prisma.badgeAward.deleteMany({ where: { workspaceId } });
    await prisma.badge.deleteMany({ where: { workspaceId } });
    await prisma.streakFreeze.deleteMany({ where: { workspaceId } });
    await prisma.streak.deleteMany({ where: { workspaceId } });
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.level.deleteMany({ where: { workspaceId } });
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  describe('sign-in and roles', () => {
    it('answers 401 UNAUTHENTICATED to a caller who is not signed in, on every kind of route', async () => {
      for (const [method, url] of [['get', '/me/growth'], ['get', '/pm/xp-rules'], ['post', '/pm/xp-adjustments'], ['get', '/levels']] as const) {
        const res = await as(null)[method](url);
        expect(res.status).toBe(401);
        expect(errorCode(res)).toBe('UNAUTHENTICATED');
      }
    });

    it('takes the caller from req.user only: identity sent in headers, query or body is ignored (rule 7)', async () => {
      const forged = { 'x-test-actor': JSON.stringify(pm()), 'x-actor-pm-id': 'PM001', 'x-workspace-id': workspaceId };
      const read = await request(app.getHttpServer()).get(`/pm/xp-rules?pmId=PM001&workspaceId=${workspaceId}`).set(forged);
      expect([read.status, errorCode(read)]).toEqual([401, 'UNAUTHENTICATED']);
      const write = await request(app.getHttpServer())
        .post('/pm/xp-adjustments')
        .set(forged)
        .send({ userId: U1, amount: 5, reason: 'x', pmId: 'PM001', workspaceId, actor: pm() });
      expect([write.status, errorCode(write)]).toEqual([401, 'UNAUTHENTICATED']);
      expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(0);
    });

    it('treats an incomplete or unknown req.user as nobody: 401 (no sub, no workspace, a role E01 never sets, the old pmId shape)', async () => {
      for (const incomplete of [{ role: 'PM', workspaceId }, { role: 'PM', sub: 'PM001' }, { sub: 'PM001', workspaceId }, { role: 'USER', sub: U1, workspaceId }, { role: 'ADMIN', sub: 'PM001', workspaceId }, { role: 'PM', sub: '', workspaceId }, { role: 'PM', pmId: 'PM001', workspaceId }]) {
        const res = await as(incomplete).get('/pm/xp-rules');
        expect([res.status, errorCode(res)]).toEqual([401, 'UNAUTHENTICATED']);
      }
    });

    it('answers 403 FORBIDDEN when the role is wrong: a user on a PM route, a PM on a user route', async () => {
      const a = await as(user(U1)).post('/pm/xp-adjustments').send({ userId: U1, amount: 5, reason: 'x' });
      expect([a.status, errorCode(a)]).toEqual([403, 'FORBIDDEN']);
      const b = await as(pm()).get('/me/growth');
      expect([b.status, errorCode(b)]).toEqual([403, 'FORBIDDEN']);
      expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('XP adjustment and my growth', () => {
    it('a PM adjusts a user\'s XP, and the user then sees it in their own summary', async () => {
      const res = await as(pm()).post('/pm/xp-adjustments').send({ userId: U1, amount: 30, reason: 'Bonus for the demo' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ newTotal: 30 });

      const mine = await as(user(U1)).get('/me/growth');
      expect(mine.status).toBe(200);
      // this test workspace has no levels, so there is no level and no next level
      expect(mine.body).toEqual({
        awardedXp: 30,
        pendingXp: 0,
        level: null,
        nextLevel: null,
        xpToNext: null,
        streak: { current: 0, longest: 0 },
        badges: [],
      });
    });

    it('takes the PM from the sign-in, never from the body: a PM field in the body is ignored, another PM is refused', async () => {
      const res = await as(pm('PM002')).post('/pm/xp-adjustments').send({ userId: U1, amount: 5, reason: 'x', pmId: 'PM001' });
      expect([res.status, errorCode(res)]).toEqual([403, 'FORBIDDEN_SCOPE']);
    });

    it('maps the rules to statuses: wrong type 400, amount 422, reason 422, below zero 422, body not an object 400', async () => {
      const post = (body: unknown) => as(pm()).post('/pm/xp-adjustments').send(body as object);
      const results = [
        await post({ userId: U1, amount: '30', reason: 'x' }),
        await post({ userId: U1, amount: 0, reason: 'x' }),
        await post({ userId: U1, amount: 5, reason: '   ' }),
        await post({ userId: U1, amount: -5, reason: 'x' }),
        await post([1, 2]),
      ];
      expect(results.map((r) => [r.status, errorCode(r)])).toEqual([
        [400, 'VALIDATION'],
        [422, 'AMOUNT'],
        [422, 'REASON_REQUIRED'],
        [422, 'NEGATIVE_TOTAL'],
        [400, 'VALIDATION'],
      ]);
      expect(await prisma.xpEvent.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('PM decision and the review queue', () => {
    it('a PM awards a pending event with a reason; deciding it again is 409; the user sees it as awarded', async () => {
      const id = await pendingEvent(U1);
      const ok = await as(pm()).post(`/pm/xp-events/${id}/decision`).send({ status: 'AWARDED', reason: 'Confirmed' });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ eventId: id, fromStatus: 'PENDING', toStatus: 'AWARDED' });

      const again = await as(pm()).post(`/pm/xp-events/${id}/decision`).send({ status: 'AWARDED', reason: 'Again' });
      expect([again.status, errorCode(again)]).toEqual([409, 'BAD_TRANSITION']);

      expect((await as(user(U1)).get('/me/growth')).body).toMatchObject({ awardedXp: 20 });
    });

    it('refuses a bad status 400, an unknown event 404, another PM\'s event 403', async () => {
      const id = await pendingEvent(U1);
      const bad = await as(pm()).post(`/pm/xp-events/${id}/decision`).send({ status: 'PENDING', reason: 'x' });
      expect([bad.status, errorCode(bad)]).toEqual([400, 'VALIDATION']);
      const missing = await as(pm()).post(`/pm/xp-events/${randomUUID()}/decision`).send({ status: 'AWARDED', reason: 'x' });
      expect([missing.status, errorCode(missing)]).toEqual([404, 'NOT_FOUND']);
      const other = await as(pm('PM002')).post(`/pm/xp-events/${id}/decision`).send({ status: 'AWARDED', reason: 'x' });
      expect([other.status, errorCode(other)]).toEqual([403, 'FORBIDDEN_SCOPE']);
    });

    it('the queue lists only the PM\'s own users\' events, can be filtered, and is paged', async () => {
      const a = await pendingEvent(U1);
      const b = await pendingEvent(U2);
      await pendingEvent(X1); // PM002's user

      const all = await as(pm()).get('/pm/xp-events');
      expect(all.status).toBe(200);
      expect((all.body as { events: { id: string }[] }).events.map((e) => e.id).sort()).toEqual([a, b].sort());

      const mine = await as(pm()).get(`/pm/xp-events?userId=${U1}&status=PENDING`);
      expect((mine.body as { events: unknown[] }).events).toHaveLength(1);

      const other = await as(pm()).get(`/pm/xp-events?userId=${X1}`);
      expect([other.status, errorCode(other)]).toEqual([403, 'FORBIDDEN_SCOPE']);
      expect((await as(pm()).get('/pm/xp-events?status=NOPE')).status).toBe(400);
      expect((await as(pm()).get('/pm/xp-events?cursor=abc')).status).toBe(400);
      expect((await as(pm()).get('/pm/xp-events?status=PENDING&status=HELD')).status).toBe(400); // an array is refused
    });

    it('filtering the queue by an unknown user is 404', async () => {
      expect((await as(pm()).get('/pm/xp-events?userId=BS99999')).status).toBe(404);
    });

    it('a user sees only their own events', async () => {
      await pendingEvent(U1);
      await pendingEvent(U2);
      const res = await as(user(U1)).get('/me/xp-events');
      const events = (res.body as { events: { userId: string }[] }).events;
      expect(events).toHaveLength(1);
      expect(events[0]?.userId).toBe(U1);
    });
  });

  describe('XP rules and levels', () => {
    it('a PM reads and edits the rules; the editing PM is recorded; a value that is not allowed is 422 RULE_VALUE, a wrong shape is 400', async () => {
      expect((await as(pm()).get('/pm/xp-rules')).body).toMatchObject({ onTimeSprint: 20, kudos: 5, updatedById: null });
      const edit = await as(pm()).put('/pm/xp-rules').send({ onTimeSprint: 25 });
      expect(edit.status).toBe(200);
      expect(edit.body).toMatchObject({ onTimeSprint: 25, updatedById: 'PM001' });
      const negativeRule = await as(pm()).put('/pm/xp-rules').send({ onTimeSprint: -1 });
      expect([negativeRule.status, errorCode(negativeRule)]).toEqual([422, 'RULE_VALUE']);
      const badCutoff = await as(pm()).put('/pm/xp-rules').send({ sprintCutoff: '25:00' });
      expect([badCutoff.status, errorCode(badCutoff)]).toEqual([422, 'RULE_VALUE']);
      expect((await as(pm()).put('/pm/xp-rules').send({})).status).toBe(400);
      expect((await as(pm()).put('/pm/xp-rules').send({ luckyBonus: 1 })).status).toBe(400);
      expect((await as(user(U1)).get('/pm/xp-rules')).status).toBe(403);
    });

    it('a PM saves the level set as one set and every signed-in person can read it; a user cannot save', async () => {
      const put = await as(pm()).put('/pm/levels').send({ levels: [{ name: 'Rookie', minXp: 0 }, { name: 'Builder', minXp: 50 }] });
      expect(put.status).toBe(200);
      expect((put.body as { name: string }[]).map((l) => l.name)).toEqual(['Rookie', 'Builder']);
      const read = await as(user(U1)).get('/levels');
      expect((read.body as { name: string }[]).map((l) => l.name)).toEqual(['Rookie', 'Builder']);

      const firstNotZero = await as(pm()).put('/pm/levels').send({ levels: [{ name: 'Only', minXp: 10 }] }); // first must be 0
      expect([firstNotZero.status, errorCode(firstNotZero)]).toEqual([422, 'LEVEL_FIRST']);
      expect((await as(pm()).put('/pm/levels').send({ levels: 'nope' })).status).toBe(400);
      expect((await as(pm()).put('/pm/levels').send({ levels: [{ name: 'A', minXp: '0' }] })).status).toBe(400);
      expect((await as(user(U1)).put('/pm/levels').send({ levels: [] })).status).toBe(403);
    });
  });

  describe('streak freezes', () => {
    it('a PM freezes a day; a duplicate is 409; the user sees the date but never the reason; the PM sees the reason', async () => {
      const ok = await as(pm()).post('/pm/streak-freezes').send({ userId: U1, date: '2026-11-17', source: 'LEAVE', reason: 'Sick leave, certificate seen' });
      expect(ok.status).toBe(201);
      const dup = await as(pm()).post('/pm/streak-freezes').send({ userId: U1, date: '2026-11-17', source: 'LEAVE', reason: 'Again' });
      expect([dup.status, errorCode(dup)]).toEqual([409, 'ALREADY_FROZEN']);

      const own = await as(user(U1)).get('/me/streak-freezes');
      expect(own.body).toEqual([{ date: '2026-11-17', source: 'LEAVE' }]);
      expect(JSON.stringify(own.body)).not.toContain('Sick leave');

      const forPm = await as(pm()).get(`/pm/streak-freezes?userId=${U1}`);
      expect(forPm.body).toMatchObject([{ date: '2026-11-17', reason: 'Sick leave, certificate seen' }]);
    });

    it('refuses another PM\'s user 403, a bad source 400, a bad date 400', async () => {
      const send = (body: object, actor = pm()) => as(actor).post('/pm/streak-freezes').send(body);
      expect((await send({ userId: X1, date: '2026-11-17', source: 'LEAVE', reason: 'x' })).status).toBe(403);
      expect((await send({ userId: U1, date: '2026-11-17', source: 'PARTY', reason: 'x' })).status).toBe(400);
      expect((await send({ userId: U1, date: '2026-02-30', source: 'LEAVE', reason: 'x' })).status).toBe(400);
      expect((await as(pm('PM002')).get(`/pm/streak-freezes?userId=${U1}`)).status).toBe(403);
    });

    it('listing a user\'s freezes needs a userId (400), and an unknown user is 404', async () => {
      const missing = await as(pm()).get('/pm/streak-freezes');
      expect([missing.status, errorCode(missing)]).toEqual([400, 'VALIDATION']);
      expect((await as(pm()).get('/pm/streak-freezes?userId=BS99999')).status).toBe(404);
    });
  });

  describe('badges', () => {
    it('create, duplicate name 409, award, award twice 409, see it on my summary, revoke, it disappears', async () => {
      const created = await as(pm()).post('/pm/badges').send({ name: 'Mentor', icon: '🏅', kind: 'SPECIAL', criteria: 'Helps others' });
      expect(created.status).toBe(201);
      const badgeId = (created.body as { badgeId: string }).badgeId;
      const dup = await as(pm()).post('/pm/badges').send({ name: 'Mentor', icon: '⭐', kind: 'SPECIAL', criteria: 'x' });
      expect([dup.status, errorCode(dup)]).toEqual([409, 'NAME_TAKEN']);

      const award = await as(pm()).post(`/pm/badges/${badgeId}/awards`).send({ userId: U1, evidence: 'Led the demo' });
      expect(award.status).toBe(201);
      const twice = await as(pm()).post(`/pm/badges/${badgeId}/awards`).send({ userId: U1, evidence: 'Again' });
      expect([twice.status, errorCode(twice)]).toEqual([409, 'ALREADY_AWARDED']);

      const mine = await as(user(U1)).get('/me/growth');
      expect((mine.body as { badges: { name: string }[] }).badges.map((b) => b.name)).toEqual(['Mentor']);

      const revoke = await as(pm()).post(`/pm/badge-awards/${(award.body as { awardId: string }).awardId}/revoke`).send({ reason: 'Mistake' });
      expect(revoke.status).toBe(201);
      expect((await as(user(U1)).get('/me/growth')).body).toMatchObject({ badges: [] });
    });

    it('creates a Behavioral badge with a rule and threshold; an unknown rule or a text threshold is 400, a missing threshold is 422 BADGE_RULE', async () => {
      const ok = await as(pm()).post('/pm/badges').send({ name: 'Streaker', icon: '🔥', kind: 'BEHAVIORAL', criteria: '5 days in a row', ruleType: 'SPRINT_STREAK', threshold: 5 });
      expect(ok.status).toBe(201);
      const badRule = await as(pm()).post('/pm/badges').send({ name: 'B1', icon: '🔥', kind: 'BEHAVIORAL', criteria: 'x', ruleType: 'NOPE', threshold: 5 });
      expect([badRule.status, errorCode(badRule)]).toEqual([400, 'VALIDATION']);
      const noThreshold = await as(pm()).post('/pm/badges').send({ name: 'B2', icon: '🔥', kind: 'BEHAVIORAL', criteria: 'x', ruleType: 'SPRINT_STREAK' });
      expect([noThreshold.status, errorCode(noThreshold)]).toEqual([422, 'BADGE_RULE']);
      const textThreshold = await as(pm()).post('/pm/badges').send({ name: 'B3', icon: '🔥', kind: 'BEHAVIORAL', criteria: 'x', ruleType: 'SPRINT_STREAK', threshold: '5' });
      expect([textThreshold.status, errorCode(textThreshold)]).toEqual([400, 'VALIDATION']);
    });

    it('refuses bad input and wrong roles: Special with a threshold 422, blank name 422, evidence 422, scope 403, user 403, retire twice 409', async () => {
      const bad = await as(pm()).post('/pm/badges').send({ name: 'X', icon: '🏅', kind: 'SPECIAL', criteria: 'x', threshold: 3 });
      expect([bad.status, errorCode(bad)]).toEqual([422, 'BADGE_RULE']);
      const noName = await as(pm()).post('/pm/badges').send({ name: ' ', icon: '🏅', kind: 'SPECIAL', criteria: 'x' });
      expect([noName.status, errorCode(noName)]).toEqual([422, 'NAME_REQUIRED']);
      const typeBad = await as(pm()).post('/pm/badges').send({ name: 'X', icon: '🏅', kind: 'TECHNICAL', criteria: 'x' });
      expect(typeBad.status).toBe(400);

      const { body } = await as(pm()).post('/pm/badges').send({ name: 'Real', icon: '🏅', kind: 'SPECIAL', criteria: 'x' });
      const badgeId = (body as { badgeId: string }).badgeId;
      expect((await as(pm()).post(`/pm/badges/${badgeId}/awards`).send({ userId: U1, evidence: '  ' })).status).toBe(422);
      expect((await as(pm()).post(`/pm/badges/${badgeId}/awards`).send({ userId: X1, evidence: 'x' })).status).toBe(403);
      expect((await as(user(U1)).post(`/pm/badges/${badgeId}/awards`).send({ userId: U1, evidence: 'x' })).status).toBe(403);

      expect((await as(pm()).post(`/pm/badges/${badgeId}/retire`)).status).toBe(201);
      const retiredTwice = await as(pm()).post(`/pm/badges/${badgeId}/retire`);
      expect([retiredTwice.status, errorCode(retiredTwice)]).toEqual([409, 'ALREADY_RETIRED']);
    });
  });
});
