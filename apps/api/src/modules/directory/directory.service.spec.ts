import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DirectoryService } from './directory.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('DirectoryService.listUsers', () => {
  const prisma = {
    user: { count: vi.fn(), findMany: vi.fn() },
  };
  let service: DirectoryService;

  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'BS23001',
    pmId: 'PM001',
    name: 'Brishty Das',
    email: 'brishty@bs23.test',
    photoPath: null,
    position: 'FULLSTACK',
    resource: 'TRAINEE',
    onboardDate: new Date('2026-09-01T00:00:00Z'),
    departureDate: null,
    userSkills: [{ skill: { name: 'SQL' } }, { skill: { name: 'React' } }],
    feedbackVersions: [{ text: 'Good progress.' }],
    ...over,
  });

  beforeEach(async () => {
    prisma.user.count.mockReset().mockResolvedValue(1);
    prisma.user.findMany.mockReset().mockResolvedValue([row()]);
    const moduleRef = await Test.createTestingModule({
      providers: [DirectoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(DirectoryService);
  });

  it('lists active users of the PM workspace, not only the PM own users', async () => {
    await service.listUsers(PM, {});
    const { where } = prisma.user.findMany.mock.calls[0][0];
    expect(where).toMatchObject({ workspaceId: 'ws1', archivedAt: null });
    expect(where).not.toHaveProperty('pmId');
  });

  it('maps a row to the list item (sorted skills, date-only strings, latest feedback)', async () => {
    const result = await service.listUsers(PM, {});
    expect(result.items).toEqual([
      {
        userId: 'BS23001',
        name: 'Brishty Das',
        email: 'brishty@bs23.test',
        photoPath: null,
        position: 'FULLSTACK',
        resource: 'TRAINEE',
        skills: ['React', 'SQL'],
        onboardDate: '2026-09-01',
        departureDate: null,
        latestFeedback: 'Good progress.',
        managedByYou: true,
      },
    ]);
  });

  it('hides feedback and says managedByYou: false for a user managed by another PM', async () => {
    prisma.user.findMany.mockResolvedValue([row({ pmId: 'PM002' }), row({ userId: 'BS23002' })]);
    const { items } = await service.listUsers(PM, {});
    expect(items[0]).toMatchObject({ userId: 'BS23001', latestFeedback: null, managedByYou: false });
    expect(items[1]).toMatchObject({ userId: 'BS23002', latestFeedback: 'Good progress.', managedByYou: true });
  });

  it('returns null feedback and a date-only departure when present', async () => {
    prisma.user.findMany.mockResolvedValue([
      row({ departureDate: new Date('2026-12-01T00:00:00Z'), feedbackVersions: [] }),
    ]);
    const [item] = (await service.listUsers(PM, {})).items;
    expect(item?.latestFeedback).toBeNull();
    expect(item?.departureDate).toBe('2026-12-01');
  });

  it('uses 5 rows per page by default and caps the page size at 50', async () => {
    prisma.user.count.mockResolvedValue(12);
    const first = await service.listUsers(PM, {});
    expect(first).toMatchObject({ pageSize: 5, totalPages: 3, page: 1 });
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 5 });

    const big = await service.listUsers(PM, { pageSize: 500 });
    expect(big.pageSize).toBe(50);
  });

  it('shows the last page when the page number is past the end', async () => {
    prisma.user.count.mockResolvedValue(12);
    const result = await service.listUsers(PM, { page: 99 });
    expect(result.page).toBe(3);
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 5 });
  });

  it('returns one empty page when nothing matches', async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    const result = await service.listUsers(PM, { q: 'zzz' });
    expect(result).toMatchObject({ items: [], total: 0, page: 1, totalPages: 1 });
  });

  it('applies the position, resource, skill and search filters', async () => {
    await service.listUsers(PM, {
      position: 'QA',
      resource: 'SBU',
      skill: 'React',
      q: '  bris ',
    });
    const { where } = prisma.user.findMany.mock.calls[0][0];
    expect(where).toMatchObject({
      position: 'QA',
      resource: 'SBU',
      userSkills: { some: { skill: { name: 'React' } } },
    });
    expect(where.OR).toEqual([
      { name: { contains: 'bris', mode: 'insensitive' } },
      { userId: { contains: 'bris', mode: 'insensitive' } },
    ]);
  });

  it('never searches by email and reads feedback only for the PM own users', async () => {
    await service.listUsers(PM, { q: 'bris' });
    const args = prisma.user.findMany.mock.calls[0][0];
    expect(JSON.stringify(args.where.OR)).not.toContain('email');
    expect(args.select.feedbackVersions.where).toEqual({ user: { pmId: 'PM001' } });
  });
});
