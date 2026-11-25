import { randomUUID } from 'node:crypto';
import type { IncomingMessage, RequestListener, Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validateEnv } from '../../config/env.validation.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ensureTestJwtSecrets } from '../growth-core/testing/test-env.js';
import { JwtAuthGuard } from '../identity/guards/jwt-auth.guard.js';
import type { RequestUser } from '../growth-core/index.js';
import { parseDay } from '../growth-core/time/org-time.js';
import { EngagementModule } from './engagement.module.js';

// The engagement HTTP routes (kudos, quests, leaderboard) end to end, with the real database. E01's JwtAuthGuard is
// replaced by a guard that lets everything through, and the test sets req.user itself on the request in the shape
// E01's guard produces ({ sub, sid, workspaceId, role }); no header says who is calling. The real login is in
// real-login.e2e-spec. Includes a demo that crosses both modules: a user sends kudos, the PM
// reviews the XP through the growth-core routes, and the leaderboard moves.
// Needs the local database. Run: pnpm --filter api test:e2e
// Own temporary workspace. U1..U4 belong to PM001, X1 to PM002, ARCH is archived.

ensureTestJwtSecrets(); // growth-core imports E01's IdentityModule, which needs JWT secrets to start

describe('engagement HTTP routes (database, req.user set by the test)', () => {
  const tag = randomUUID().slice(0, 6);
  const [U1, U2, U3, U4, X1, ARCH] = ['U1', 'U2', 'U3', 'U4', 'X1', 'AR'].map((n) => `THE${n}${tag}`) as [string, string, string, string, string, string];
  let app: INestApplication;
  let prisma: PrismaService;
  let workspaceId: string;

  // req.user as E01's JwtAuthGuard sets it: sub is the Pm.pmId or User.userId, every User has the role USER.
  const pm = (pmId = 'PM001'): RequestUser => ({ sub: pmId, sid: 'test-session', workspaceId, role: 'PM' });
  const user = (userId: string): RequestUser => ({ sub: userId, sid: 'test-session', workspaceId, role: 'USER' });
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
  const sendKudos = (from: string, to: string, over: object = {}) =>
    as(user(from)).post('/kudos').send({ toUserId: to, category: 'HELPFUL', message: 'Thanks for the help', ...over });
  const makeUser = (userId: string, pmId: string, archivedAt: Date | null = null) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId,
        email: `${userId.toLowerCase()}@eng-http-test.invalid`,
        name: `Name ${userId}`,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: parseDay('2026-01-01'),
        archivedAt,
      },
    });
  const clean = async () => {
    await prisma.xpReview.deleteMany({ where: { workspaceId } });
    await prisma.xpEvent.deleteMany({ where: { workspaceId } });
    await prisma.kudos.deleteMany({ where: { workspaceId } });
    await prisma.questProgress.deleteMany({ where: { workspaceId } });
    await prisma.quest.deleteMany({ where: { workspaceId } });
    await prisma.leaderboardPreference.deleteMany({ where: { workspaceId } });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), PrismaModule, EngagementModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true }) // the real guard is exercised in real-login.e2e-spec
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = moduleRef.get(PrismaService);
    workspaceId = (await prisma.workspace.create({ data: { name: 'Engagement HTTP test', slug: `t-ehttp-${tag}` } })).id;
    await prisma.xpRule.create({ data: { workspaceId } });
    for (const u of [U1, U2, U3, U4]) await makeUser(u, 'PM001');
    await makeUser(X1, 'PM002');
    await makeUser(ARCH, 'PM001', new Date('2026-06-01T00:00:00Z'));
  });

  afterEach(clean);

  afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { workspaceId } });
    await prisma.xpRule.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await app.close();
  });

  describe('sign-in and roles', () => {
    it('answers 401 to a caller who has no req.user (nobody is signed in)', async () => {
      for (const [method, url] of [['get', '/kudos'], ['get', '/quests'], ['get', '/leaderboard'], ['post', '/kudos']] as const) {
        const res = await as(null)[method](url);
        expect([res.status, errorCode(res)]).toEqual([401, 'UNAUTHENTICATED']);
      }
    });

    it('takes the caller from req.user only: identity sent in headers, query or body is ignored (rule 7)', async () => {
      const forged = { 'x-test-actor': JSON.stringify(user(U1)), 'x-actor-pm-id': 'PM001', 'x-user-id': U1, 'x-workspace-id': workspaceId };
      const read = await request(app.getHttpServer()).get(`/quests?userId=${U1}&workspaceId=${workspaceId}`).set(forged);
      expect([read.status, errorCode(read)]).toEqual([401, 'UNAUTHENTICATED']);
      const write = await request(app.getHttpServer())
        .post('/kudos')
        .set(forged)
        .send({ toUserId: U2, category: 'HELPFUL', message: 'Thanks', fromUserId: U1, userId: U1, workspaceId, actor: user(U1) });
      expect([write.status, errorCode(write)]).toEqual([401, 'UNAUTHENTICATED']);
      expect(await prisma.kudos.count({ where: { workspaceId } })).toBe(0);
    });

    it('treats an incomplete or unknown req.user as nobody: 401 (no sub, no workspace, a role E01 never sets, the old userId shape)', async () => {
      for (const incomplete of [{ role: 'USER', workspaceId }, { role: 'USER', sub: U1 }, { sub: U1, workspaceId }, { role: 'USER', sub: U1, workspaceId }, { role: 'ADMIN', sub: U1, workspaceId }, { role: 'USER', sub: '', workspaceId }, { role: 'USER', userId: U1, workspaceId }]) {
        const res = await as(incomplete).get('/quests');
        expect([res.status, errorCode(res)]).toEqual([401, 'UNAUTHENTICATED']);
      }
    });

    it('answers 403 when the role is wrong: a PM cannot send kudos, a user cannot create quests or hide someone else', async () => {
      expect((await as(pm()).post('/kudos').send({ toUserId: U1, category: 'HELPFUL', message: 'x' })).status).toBe(403);
      expect((await as(user(U1)).post('/pm/quests').send({})).status).toBe(403);
      expect((await as(pm()).put('/me/leaderboard-preference').send({ hidden: true })).status).toBe(403);
      expect(await prisma.kudos.count({ where: { workspaceId } })).toBe(0);
    });
  });

  describe('kudos', () => {
    it('a user sends kudos: 201, the sender comes from the sign-in and the day from the server, whatever the body says', async () => {
      const res = await sendKudos(U1, U2, { fromUserId: U3, sentOn: '1999-01-01' });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ kudosId: expect.any(String) as string }); // the sender learns nothing more (see "privacy")
      const row = await prisma.kudos.findFirstOrThrow({ where: { workspaceId } });
      expect(row.fromUserId).toBe(U1); // not U3
      expect(row.sentOn.toISOString().slice(0, 10)).not.toBe('1999-01-01');
    });

    it('maps the rules to statuses: bad shape 400, self 422, blank 422, cooldown 422, weekly limit 422, unknown user 404, archived 422', async () => {
      expect((await sendKudos(U1, U2, { category: 'PRAISE' })).status).toBe(400);
      expect((await sendKudos(U1, U2, { toUserId: 123 })).status).toBe(400);
      expect((await sendKudos(U1, U2, { message: undefined })).status).toBe(400);
      const results = [
        await sendKudos(U1, U1),
        await sendKudos(U1, U2, { message: '   ' }),
        await sendKudos(U1, 'BS99999'),
        await sendKudos(U1, ARCH),
      ];
      expect(results.map((r) => [r.status, errorCode(r)])).toEqual([
        [422, 'SELF_KUDOS'],
        [422, 'MESSAGE_REQUIRED'],
        [404, 'NOT_FOUND'],
        [422, 'USER_ARCHIVED'],
      ]);
      expect((await sendKudos(U1, U2)).status).toBe(201);
      const cooldown = await sendKudos(U1, U2);
      expect([cooldown.status, errorCode(cooldown)]).toEqual([422, 'COOLDOWN']);
      expect((await sendKudos(U1, U3)).status).toBe(201);
      expect((await sendKudos(U1, U4)).status).toBe(201);
      const limit = await sendKudos(U1, X1);
      expect([limit.status, errorCode(limit)]).toEqual([422, 'SEND_LIMIT']);
    });

    it('a user sees only their own kudos; a PM sees the kudos of their own users only', async () => {
      await sendKudos(U1, U2);
      await sendKudos(X1, U3); // involves PM002's user and a PM001 user
      const own = (await as(user(U4)).get('/kudos')).body as { kudos: unknown[] };
      expect(own.kudos).toHaveLength(0);
      const u1 = (await as(user(U1)).get('/kudos')).body as { kudos: { fromUserId: string }[] };
      expect(u1.kudos.map((k) => k.fromUserId)).toEqual([U1]);
      const pm1 = (await as(pm('PM001')).get('/kudos')).body as { kudos: unknown[] };
      expect(pm1.kudos).toHaveLength(2);
      const pm2 = (await as(pm('PM002')).get('/kudos')).body as { kudos: { fromUserId: string }[] };
      expect(pm2.kudos.map((k) => k.fromUserId)).toEqual([X1]);
      expect((await as(user(U1)).get('/kudos?cursor=abc')).status).toBe(400);
    });
  });

  describe('kudos: names and the limits a user sees', () => {
    it('GET /kudos carries the names of the sender and the receiver, for a user and for a PM', async () => {
      await sendKudos(U1, U2);
      const mine = (await as(user(U2)).get('/kudos')).body as { kudos: { fromName: string; toName: string }[] };
      expect(mine.kudos[0]).toMatchObject({ fromName: `Name ${U1}`, toName: `Name ${U2}` });
      const theirs = (await as(pm()).get('/kudos')).body as { kudos: { fromName: string; toName: string }[] };
      expect(theirs.kudos[0]).toMatchObject({ fromName: `Name ${U1}`, toName: `Name ${U2}` });
    });

    it('GET /me/kudos-limits gives sent this week, the weekly limit and the cooldown, per user', async () => {
      expect((await as(user(U1)).get('/me/kudos-limits')).body).toEqual({ sentThisWeek: 0, sendLimitPerWeek: 3, cooldownDays: 7 });
      await sendKudos(U1, U2);
      await sendKudos(U1, U3);
      expect((await as(user(U1)).get('/me/kudos-limits')).body).toMatchObject({ sentThisWeek: 2 });
      expect((await as(user(U2)).get('/me/kudos-limits')).body).toMatchObject({ sentThisWeek: 0 }); // receiving does not count
    });

    it('follows the XP rules, and agrees with the refusal when the limit is reached', async () => {
      await prisma.xpRule.update({ where: { workspaceId }, data: { kudosSendLimitPerWeek: 1, kudosCooldownDays: 2 } });
      expect((await as(user(U1)).get('/me/kudos-limits')).body).toMatchObject({ sendLimitPerWeek: 1, cooldownDays: 2 });
      await sendKudos(U1, U2);
      const limits = (await as(user(U1)).get('/me/kudos-limits')).body as { sentThisWeek: number; sendLimitPerWeek: number };
      expect(limits.sentThisWeek).toBe(limits.sendLimitPerWeek);
      const refused = await sendKudos(U1, U3);
      expect([refused.status, errorCode(refused)]).toEqual([422, 'SEND_LIMIT']);
      await prisma.xpRule.update({ where: { workspaceId }, data: { kudosSendLimitPerWeek: 3, kudosCooldownDays: 7 } });
    });

    it('is for users only and needs a sign-in', async () => {
      expect((await as(pm()).get('/me/kudos-limits')).status).toBe(403);
      expect((await as(null).get('/me/kudos-limits')).status).toBe(401);
    });
  });

  // The suspicious flag is a PM's information (SRS: private fields are removed on the server). U1 and U2 send each
  // other kudos in the same week: a mutual exchange, so both kudos are suspicious and their XP is held and flagged.
  describe('privacy: the suspicious flag never reaches a user', () => {
    const exchange = async () => {
      const first = await sendKudos(U1, U2);
      const second = await sendKudos(U2, U1);
      return { first, second };
    };

    it('the sender of a kudos only gets its id, even in a mutual exchange', async () => {
      const { first, second } = await exchange();
      expect(first.body).toEqual({ kudosId: expect.any(String) as string });
      expect(second.body).toEqual({ kudosId: expect.any(String) as string });
      // ...while the exchange really is suspicious in the database
      expect(await prisma.kudos.count({ where: { workspaceId, suspicious: true } })).toBe(2);
    });

    it('GET /kudos: a user sees no `suspicious` field, a PM sees it', async () => {
      await exchange();
      const mine = await as(user(U1)).get('/kudos');
      const rows = (mine.body as { kudos: Record<string, unknown>[] }).kudos;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(Object.keys(row).sort()).toEqual(['category', 'fromName', 'fromUserId', 'id', 'message', 'sentOn', 'toName', 'toUserId']);
      }
      expect(JSON.stringify(mine.body)).not.toContain('suspicious');

      const theirs = await as(pm()).get('/kudos');
      expect((theirs.body as { kudos: { suspicious: boolean }[] }).kudos.map((k) => k.suspicious)).toEqual([true, true]);
    });

    it('GET /me/xp-events: the receiver sees the status but no flag; the PM queue keeps the flag', async () => {
      await exchange();
      const flagged = await prisma.xpEvent.findMany({ where: { workspaceId, flag: 'Suspicious exchange' } });
      expect(flagged.length).toBeGreaterThan(0); // the flag exists in the database

      const mine = await as(user(U1)).get('/me/xp-events');
      const events = (mine.body as { events: Record<string, unknown>[] }).events;
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) expect(event).not.toHaveProperty('flag');
      expect(JSON.stringify(mine.body)).not.toContain('Suspicious');
      expect(events.some((e) => e.status === 'HELD')).toBe(true); // the user can still see that it is waiting

      const queue = await as(pm()).get('/pm/xp-events?status=HELD');
      const held = (queue.body as { events: { flag: string | null }[] }).events;
      expect(held.some((e) => e.flag === 'Suspicious exchange')).toBe(true);
    });
  });

  describe('quests', () => {
    const quest = (over: object = {}) =>
      as(pm()).post('/pm/quests').send({ name: 'Send 5 kudos', description: 'Recognise teammates', target: 5, reward: 20, startDate: '2026-11-16', endDate: '2026-11-22', ...over });

    it('creating: 201; a wrong type 400; an end before the start 422 DATES', async () => {
      expect((await quest()).status).toBe(201);
      expect((await quest({ target: '5' })).status).toBe(400);
      const dates = await quest({ startDate: '2026-11-20', endDate: '2026-11-19' });
      expect([dates.status, errorCode(dates)]).toEqual([422, 'DATES']);
    });

    it('record progress, verify below the target (nothing paid), at the target (paid once), and again (nothing more)', async () => {
      const questId = ((await quest({ target: 3, reward: 15 })).body as { questId: string }).questId;
      expect((await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: U1, count: 2 })).status).toBe(201);
      expect((await as(pm()).post(`/pm/quests/${questId}/verify`).send({ userId: U1 })).body).toMatchObject({ paid: false, reason: 'BELOW_TARGET' });

      await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: U1, count: 3 });
      const paid = await as(pm()).post(`/pm/quests/${questId}/verify`).send({ userId: U1 });
      expect(paid.body).toMatchObject({ paid: true, amount: 15 });
      const again = await as(pm()).post(`/pm/quests/${questId}/verify`).send({ userId: U1 });
      expect(again.body).toEqual({ paid: false, reason: 'ALREADY_PAID' });
      expect(await prisma.xpEvent.count({ where: { workspaceId, userId: U1, source: 'QUEST' } })).toBe(1);
    });

    it('refuses: no progress 422, another PM\'s user 403, unknown quest 404, a bad count 422/400', async () => {
      const questId = ((await quest()).body as { questId: string }).questId;
      const noProgress = await as(pm()).post(`/pm/quests/${questId}/verify`).send({ userId: U1 });
      expect([noProgress.status, errorCode(noProgress)]).toEqual([422, 'NO_PROGRESS']);
      expect((await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: X1, count: 1 })).status).toBe(403);
      expect((await as(pm()).post(`/pm/quests/${randomUUID()}/verify`).send({ userId: U1 })).status).toBe(404);
      expect((await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: U1, count: '2' })).status).toBe(400);
      const negative = await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: U1, count: -1 });
      expect([negative.status, errorCode(negative)]).toEqual([422, 'COUNT']); // SRS: COUNT, 422
    });

    it('everyone lists quests; a user sees only their own progress; a PM only their own users\'', async () => {
      const questId = ((await quest()).body as { questId: string }).questId;
      await as(pm()).post(`/pm/quests/${questId}/progress`).send({ userId: U1, count: 1 });
      await as(pm('PM002')).post(`/pm/quests/${questId}/progress`).send({ userId: X1, count: 4 });

      expect(((await as(user(U2)).get('/quests')).body as { quests: unknown[] }).quests).toHaveLength(1);
      expect(((await as(pm('PM002')).get('/quests')).body as { quests: unknown[] }).quests).toHaveLength(1);
      expect(((await as(user(U1)).get('/me/quest-progress')).body as { userId: string }[]).map((p) => p.userId)).toEqual([U1]);
      expect(((await as(user(U2)).get('/me/quest-progress')).body as unknown[])).toHaveLength(0);
      expect(((await as(pm()).get('/pm/quest-progress')).body as { userId: string }[]).map((p) => p.userId)).toEqual([U1]);
      expect(((await as(pm('PM002')).get('/pm/quest-progress')).body as { userId: string }[]).map((p) => p.userId)).toEqual([X1]);
    });
  });

  describe('leaderboard', () => {
    it('a user and a PM read the board; a bad window or cursor is 400', async () => {
      expect((await as(user(U1)).get('/leaderboard?window=weekly')).status).toBe(200);
      expect((await as(pm()).get('/leaderboard')).body).toMatchObject({ viewer: 'PM', window: 'all' });
      expect((await as(user(U1)).get('/leaderboard?window=yearly')).status).toBe(400);
      expect((await as(user(U1)).get('/leaderboard?cursor=x')).status).toBe(400);
    });

    it('a user hides themself: a peer sees "Hidden user" with no trace of them, the user sees "You", the PM sees the name', async () => {
      await as(pm()).post('/pm/xp-adjustments').send({ userId: U2, amount: 40, reason: 'Seed XP for the board' });
      expect((await as(user(U2)).put('/me/leaderboard-preference').send({ hidden: 'yes' })).status).toBe(400);
      const hide = await as(user(U2)).put('/me/leaderboard-preference').send({ hidden: true });
      expect(hide.status).toBe(200);
      expect((await as(user(U2)).get('/me/leaderboard-preference')).body).toEqual({ hidden: true });

      const peer = await as(user(U1)).get('/leaderboard');
      const payload = JSON.stringify(peer.body);
      expect(payload).toContain('Hidden user');
      expect(payload).not.toContain(U2);
      expect(payload).not.toContain(`Name ${U2}`);
      expect(payload).not.toContain('userId');
      expect(((peer.body as { rows: { name: string }[] }).rows)[0]).toMatchObject({ name: 'Hidden user', xp: 40, rank: 1 });

      expect(((await as(user(U2)).get('/leaderboard')).body as { rows: { name: string }[] }).rows[0]).toMatchObject({ name: 'You' });
      expect(((await as(pm()).get('/leaderboard')).body as { rows: { name: string; hiddenFromPeers: boolean }[] }).rows[0]).toMatchObject({
        name: `Name ${U2}`,
        hiddenFromPeers: true,
      });
    });
  });

  describe('demo across both modules', () => {
    it('a user sends kudos, the receiver sees pending XP, the PM approves it, and the receiver\'s XP and rank follow', async () => {
      // 1. U1 sends kudos to U2 (engagement route)
      expect((await sendKudos(U1, U2, { category: 'TEAMWORK', message: 'Great pairing session' })).status).toBe(201);

      // 2. U2 sees 5 pending XP and nothing awarded yet (growth-core route)
      expect((await as(user(U2)).get('/me/growth')).body).toMatchObject({ awardedXp: 0, pendingXp: 5 });

      // 3. The PM finds it in the review queue and approves it with a reason (growth-core routes)
      const queue = (await as(pm()).get(`/pm/xp-events?userId=${U2}&status=PENDING`)).body as { events: { id: string; source: string; amount: number }[] };
      expect(queue.events).toHaveLength(1);
      expect(queue.events[0]).toMatchObject({ source: 'KUDOS', amount: 5 });
      const decision = await as(pm()).post(`/pm/xp-events/${queue.events[0]?.id}/decision`).send({ status: 'AWARDED', reason: 'Genuine recognition' });
      expect(decision.status).toBe(201);

      // 4. U2 now has 5 awarded XP, and the leaderboard shows U2 first (engagement route)
      expect((await as(user(U2)).get('/me/growth')).body).toMatchObject({ awardedXp: 5, pendingXp: 0 });
      const board = (await as(user(U1)).get('/leaderboard')).body as { rows: { name: string; xp: number; rank: number }[] };
      expect(board.rows[0]).toMatchObject({ name: `Name ${U2}`, xp: 5, rank: 1 });

      // 5. The PM reverses it, and the rank drops back at once
      await as(pm()).post(`/pm/xp-events/${queue.events[0]?.id}/decision`).send({ status: 'REVERSED', reason: 'Collusion found' });
      const after = (await as(user(U1)).get('/leaderboard')).body as { rows: { name: string; xp: number }[] };
      expect(after.rows.find((r) => r.name === `Name ${U2}`)).toMatchObject({ xp: 0 });
    });
  });
});
