import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ArchiveService } from './archive.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('ArchiveService.listArchived', () => {
  const prisma = { user: { findMany: vi.fn() } };
  let service: ArchiveService;

  beforeEach(async () => {
    prisma.user.findMany.mockReset().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [ArchiveService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ArchiveService);
  });

  it('asks only for archived users of the PM workspace, newest archived first', async () => {
    await service.listArchived(PM);
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ workspaceId: 'ws1', archivedAt: { not: null } });
    expect(arg.orderBy).toEqual([{ archivedAt: 'desc' }, { userId: 'asc' }]);
  });

  it('returns an empty list when nobody is archived', async () => {
    await expect(service.listArchived(PM)).resolves.toEqual({ items: [] });
  });

  it('maps a row (date-only dates, archivedAt as a date-time)', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        userId: 'BS23005',
        pmId: 'PM001',
        name: 'Demo Archived',
        email: 'bs23005@bs23.test',
        photoPath: null,
        position: 'FRONTEND',
        resource: 'TRAINEE',
        onboardDate: new Date('2026-05-01T00:00:00Z'),
        departureDate: new Date('2026-08-01T00:00:00Z'),
        archivedAt: new Date('2026-08-02T00:00:00Z'),
      },
    ]);
    const { items } = await service.listArchived(PM);
    expect(items).toEqual([
      {
        userId: 'BS23005',
        name: 'Demo Archived',
        email: 'bs23005@bs23.test',
        photoPath: null,
        position: 'FRONTEND',
        resource: 'TRAINEE',
        onboardDate: '2026-05-01',
        departureDate: '2026-08-01',
        archivedAt: '2026-08-02T00:00:00.000Z',
        managedByYou: true,
      },
    ]);
  });

  it('says managedByYou: false for an archived user of another PM', async () => {
    const base = {
      name: 'X',
      email: 'x@bs23.test',
      photoPath: null,
      position: 'QA',
      resource: 'SBU',
      onboardDate: new Date('2026-05-01T00:00:00Z'),
      departureDate: null,
      archivedAt: new Date('2026-08-02T00:00:00Z'),
    };
    prisma.user.findMany.mockResolvedValue([
      { ...base, userId: 'BS23006', pmId: 'PM001' },
      { ...base, userId: 'BS23007', pmId: 'PM002' },
    ]);
    const { items } = await service.listArchived(PM);
    expect(items.map((i) => [i.userId, i.managedByYou])).toEqual([
      ['BS23006', true],
      ['BS23007', false],
    ]);
  });

  it('keeps an empty departure date as null', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        userId: 'BS23006',
        pmId: 'PM001',
        name: 'X',
        email: 'x@bs23.test',
        photoPath: null,
        position: 'QA',
        resource: 'SBU',
        onboardDate: new Date('2026-05-01T00:00:00Z'),
        departureDate: null,
        archivedAt: new Date('2026-08-02T00:00:00Z'),
      },
    ]);
    const { items } = await service.listArchived(PM);
    expect(items[0]?.departureDate).toBeNull();
  });
});
