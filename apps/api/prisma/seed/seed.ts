// Local / test / staging seed data. NEVER run against production (see docs/architecture.md §5.4).
//
// Run from the repo root:   pnpm db:seed
// Safe to run many times: every row is upserted by a stable key, nothing is duplicated.
//
// Creates: 1 workspace, 2 PMs, 4 users (one per resource type), their login credentials,
// 6 skills, 1 team with all 4 users, the XP rule row and 2 levels.
// Courses are NOT seeded here: the real 50-course catalog is still an open decision (PRD p.9).

import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import type {
  AttendanceMode,
  Position,
  UserResource,
} from '../../src/generated/prisma/client.js';

if (process.env['NODE_ENV'] === 'production') {
  throw new Error('Refusing to seed: NODE_ENV is production.');
}

const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env first.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Same password for every seeded account. Local/test data only.
const SEED_PASSWORD = process.env['SEED_PASSWORD'] ?? 'Password123!';

// Same format as E01's NestJS password service:
//   scrypt (N=16384, r=8, p=1), 64-byte key, 16 random salt bytes as hex,
//   stored as "<32-char hex salt>:<128-char hex hash>", verified with timingSafeEqual().
// The hex salt STRING is the scrypt salt. If E01's code passes the raw salt bytes
// instead, change `salt` below to `Buffer.from(salt, 'hex')`.
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${salt}:${hash.toString('hex')}`;
}

const pms = [
  { pmId: 'PM001', name: 'Demo PM One', email: 'pm001@bs23.test' },
  { pmId: 'PM002', name: 'Demo PM Two', email: 'pm002@bs23.test' },
];

const users: {
  userId: string;
  name: string;
  email: string;
  resource: UserResource;
  position: Position;
  attendanceMode: AttendanceMode;
  pmId: string;
  skills: string[];
}[] = [
  {
    userId: 'BS23001',
    name: 'Demo Trainee',
    email: 'bs23001@bs23.test',
    resource: 'TRAINEE',
    position: 'BACKEND',
    attendanceMode: 'PHYSICAL',
    pmId: 'PM001',
    skills: ['Node.js', 'SQL'],
  },
  {
    userId: 'BS23002',
    name: 'Demo Central L&D',
    email: 'bs23002@bs23.test',
    resource: 'CENTRAL_LND',
    position: 'FRONTEND',
    attendanceMode: 'ONLINE',
    pmId: 'PM001',
    skills: ['HTML & CSS', 'JavaScript', 'React'],
  },
  {
    userId: 'BS23003',
    name: 'Demo Industrial Attachment',
    email: 'bs23003@bs23.test',
    resource: 'INDUSTRIAL_ATTACHMENT',
    position: 'FULLSTACK',
    attendanceMode: 'PHYSICAL',
    pmId: 'PM001',
    skills: ['JavaScript', 'React', 'Node.js'],
  },
  {
    userId: 'BS23004',
    name: 'Demo SBU',
    email: 'bs23004@bs23.test',
    resource: 'SBU',
    position: 'QA',
    attendanceMode: 'ONLINE',
    pmId: 'PM002',
    skills: ['Testing'],
  },
];

const skillNames = ['HTML & CSS', 'JavaScript', 'React', 'Node.js', 'SQL', 'Testing'];

const levels = [
  { name: 'Rookie', minXp: 0 },
  { name: 'Builder', minXp: 250 },
];

async function main(): Promise<void> {
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'bs23' },
    update: {},
    create: { name: 'BS23 Training', slug: 'bs23' },
  });
  const workspaceId = workspace.id;

  for (const pm of pms) {
    await prisma.pm.upsert({
      where: { pmId: pm.pmId },
      update: { name: pm.name, email: pm.email },
      create: { ...pm, workspaceId, emailVerified: true },
    });
    const passwordHash = hashPassword(SEED_PASSWORD);
    await prisma.credential.upsert({
      where: { pmId: pm.pmId },
      update: { passwordHash },
      create: { workspaceId, pmId: pm.pmId, passwordHash },
    });
  }

  const skillIds = new Map<string, string>();
  for (const name of skillNames) {
    const skill = await prisma.skill.upsert({
      where: { workspaceId_name: { workspaceId, name } },
      update: {},
      create: { workspaceId, name },
    });
    skillIds.set(name, skill.id);
  }

  for (const { skills, ...user } of users) {
    await prisma.user.upsert({
      where: { userId: user.userId },
      update: { name: user.name, email: user.email, pmId: user.pmId },
      create: {
        ...user,
        workspaceId,
        emailVerified: true,
        onboardDate: new Date('2026-11-01'),
        departureDate: new Date('2027-01-31'),
        skillAssessmentMinutes: 60,
        skillAssessmentMarks: 100,
      },
    });
    const passwordHash = hashPassword(SEED_PASSWORD);
    await prisma.credential.upsert({
      where: { userId: user.userId },
      update: { passwordHash },
      create: { workspaceId, userId: user.userId, passwordHash },
    });
    for (const name of skills) {
      const skillId = skillIds.get(name);
      if (!skillId) throw new Error(`Unknown skill in seed: ${name}`);
      await prisma.userSkill.upsert({
        where: { userId_skillId: { userId: user.userId, skillId } },
        update: {},
        create: { workspaceId, userId: user.userId, skillId },
      });
    }
  }

  const team = await prisma.team.upsert({
    where: { workspaceId_name: { workspaceId, name: 'Team Alpha' } },
    update: {},
    create: { workspaceId, name: 'Team Alpha', pmId: 'PM001' },
  });
  for (const user of users) {
    await prisma.membership.upsert({
      where: { teamId_userId: { teamId: team.id, userId: user.userId } },
      update: {},
      create: { workspaceId, teamId: team.id, userId: user.userId },
    });
  }

  await prisma.xpRule.upsert({
    where: { workspaceId },
    update: {},
    create: { workspaceId },
  });

  for (const level of levels) {
    const exists = await prisma.level.findFirst({
      where: { workspaceId, name: level.name, retiredAt: null },
    });
    if (!exists) {
      await prisma.level.create({ data: { workspaceId, ...level } });
    }
  }

  console.log('Seed done.');
  console.log(`  Workspace: ${workspace.name} (${workspace.slug})`);
  console.log(`  PMs:       ${pms.map((p) => p.pmId).join(', ')}`);
  console.log(`  Users:     ${users.map((u) => `${u.userId} (${u.resource})`).join(', ')}`);
  console.log(`  Password for every account: ${SEED_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
