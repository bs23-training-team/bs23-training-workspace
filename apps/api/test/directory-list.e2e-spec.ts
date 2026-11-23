/**
 * E02 All Users list against a REAL PostgreSQL database (the unit tests use a mocked Prisma).
 *
 * NOT RUN BY DEFAULT. Same rules as identity.e2e-spec.ts: point it at a throw-away TEST database.
 * It writes rows only inside its own workspace and removes them at the end.
 *
 *   TEST_DATABASE_URL="postgresql://.../bs23_test" E2E_CONFIRM_TEST_DB=yes \
 *     pnpm --filter api test:e2e
 *
 * The database name must contain "test" and E2E_CONFIRM_TEST_DB must be "yes".
 * Never point this at the shared / central database. The migration must already be applied.
 *
 * What it proves that a mocked Prisma cannot: the case-insensitive search, the skill filter,
 * paging and the archived / other-workspace exclusion work in the real SQL.
 */

import { randomBytes } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../src/prisma/prisma.service.js';
import { DirectoryService } from '../src/modules/directory/directory.service.js';

const url = process.env['TEST_DATABASE_URL'];
const confirmed = process.env['E2E_CONFIRM_TEST_DB'] === 'yes';

if (url) {
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name) || !confirmed) {
    throw new Error(
      'Refusing to run: TEST_DATABASE_URL must name a database containing "test" and E2E_CONFIRM_TEST_DB must be "yes".',
    );
  }
}

const suite = url ? describe : describe.skip;

suite('directory All Users list against real PostgreSQL', () => {
  const run = randomBytes(3).toString('hex');
  const pmId = `PM9${Math.floor(100000 + Math.random() * 899999)}`;
  const otherPmId = `PM9${Math.floor(100000 + Math.random() * 899999)}`;
  const base = Math.floor(100000 + Math.random() * 800000);
  const id = (n: number) => `BS239${base + n}`;

  let prisma: PrismaService;
  let service: DirectoryService;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let actor: { pmId: string; workspaceId: string };

  const newUser = (userId: string, name: string, ws: string, extra: Record<string, unknown> = {}) =>
    prisma.user.create({
      data: {
        userId,
        workspaceId: ws,
        name,
        email: `${userId.toLowerCase()}-${run}@example.test`,
        emailVerified: true,
        resource: 'TRAINEE',
        pmId,
        position: 'BACKEND',
        attendanceMode: 'ONLINE',
        onboardDate: new Date('2026-01-01T00:00:00Z'),
        ...extra,
      },
    });

  beforeAll(async () => {
    const config = new ConfigService({ DATABASE_URL: url });
    prisma = new PrismaService(config);
    service = new DirectoryService(prisma);

    const ws = await prisma.workspace.create({ data: { name: `e2e dir ${run}`, slug: `e2e-dir-${run}` } });
    const other = await prisma.workspace.create({ data: { name: `e2e dir other ${run}`, slug: `e2e-dir-other-${run}` } });
    workspaceId = ws.id;
    otherWorkspaceId = other.id;
    actor = { pmId, workspaceId };

    await prisma.pm.create({
      data: { pmId, workspaceId, name: 'E2E PM', email: `e2e-dir-pm-${run}@example.test`, emailVerified: true },
    });

    await newUser(id(1), 'Alice Brisbane', workspaceId, { position: 'FRONTEND' });
    await newUser(id(2), 'BRIS Brown', workspaceId);
    await newUser(id(3), 'Carol Green', workspaceId);
    await newUser(id(4), 'Dan Archived', workspaceId, { archivedAt: new Date('2026-02-01T00:00:00Z') });
    await prisma.pm.create({
      data: { pmId: otherPmId, workspaceId: otherWorkspaceId, name: 'Other PM', email: `e2e-dir-other-pm-${run}@example.test`, emailVerified: true },
    });
    await newUser(id(5), 'Eve Other Workspace', otherWorkspaceId, { pmId: otherPmId });

    const skill = await prisma.skill.create({ data: { workspaceId, name: `Skill ${run}` } });
    await prisma.userSkill.create({ data: { workspaceId, userId: id(3), skillId: skill.id } });
  }, 60_000);

  afterAll(async () => {
    for (const wsId of [workspaceId, otherWorkspaceId].filter(Boolean)) {
      await prisma.userSkill.deleteMany({ where: { workspaceId: wsId } });
      await prisma.skill.deleteMany({ where: { workspaceId: wsId } });
      await prisma.user.deleteMany({ where: { workspaceId: wsId } });
      await prisma.pm.deleteMany({ where: { workspaceId: wsId } });
      await prisma.workspace.delete({ where: { id: wsId } });
    }
    await prisma.$disconnect();
  });

  it('lists only active users of the PM\'s own workspace', async () => {
    const res = await service.listUsers(actor, {});
    expect(res.items.map((u) => u.userId)).toEqual([id(1), id(2), id(3)]);
    expect(res.total).toBe(3);
  });

  it('searches name, user ID and email case-insensitively', async () => {
    const byName = await service.listUsers(actor, { q: 'bris' });
    expect(byName.items.map((u) => u.userId)).toEqual([id(1), id(2)]);

    const byId = await service.listUsers(actor, { q: id(3).toLowerCase() });
    expect(byId.items.map((u) => u.userId)).toEqual([id(3)]);

    const byEmail = await service.listUsers(actor, { q: id(2).toUpperCase() });
    expect(byEmail.items.map((u) => u.userId)).toEqual([id(2)]);
  });

  it('filters by skill and by position', async () => {
    const bySkill = await service.listUsers(actor, { skill: `Skill ${run}` });
    expect(bySkill.items.map((u) => u.userId)).toEqual([id(3)]);
    expect(bySkill.items[0]?.skills).toEqual([`Skill ${run}`]);

    const byPosition = await service.listUsers(actor, { position: 'FRONTEND' });
    expect(byPosition.items.map((u) => u.userId)).toEqual([id(1)]);
  });

  it('pages the result and shows the last page when the page number is too high', async () => {
    const first = await service.listUsers(actor, { pageSize: 2, page: 1 });
    expect(first.items.map((u) => u.userId)).toEqual([id(1), id(2)]);
    expect(first).toMatchObject({ total: 3, totalPages: 2, page: 1 });

    const beyond = await service.listUsers(actor, { pageSize: 2, page: 99 });
    expect(beyond.items.map((u) => u.userId)).toEqual([id(3)]);
    expect(beyond.page).toBe(2);
  });
});
