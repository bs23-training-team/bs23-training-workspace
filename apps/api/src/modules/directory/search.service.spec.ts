import { Test } from '@nestjs/testing';
import { SEARCH_RESULT_LIMIT } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SearchService } from './search.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('SearchService.searchUsers', () => {
  const prisma = { user: { findMany: vi.fn() } };
  let service: SearchService;

  beforeEach(async () => {
    prisma.user.findMany.mockReset().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SearchService);
  });

  it('returns nothing, and does not touch the users table, for empty or blank text', async () => {
    await expect(service.searchUsers(PM, '')).resolves.toEqual({ items: [] });
    await expect(service.searchUsers(PM, '   ')).resolves.toEqual({ items: [] });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('searches name, User ID and email (ignoring case) in the whole workspace, archived users included', async () => {
    await service.searchUsers(PM, '  Bris ');
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where.workspaceId).toBe('ws1');
    expect(arg.where).not.toHaveProperty('archivedAt'); // archived users are found too
    expect(arg.where.OR).toEqual([
      { name: { contains: 'Bris', mode: 'insensitive' } },
      { userId: { contains: 'Bris', mode: 'insensitive' } },
      { email: { contains: 'Bris', mode: 'insensitive' } },
    ]);
  });

  it('returns at most 6 results in a stable order', async () => {
    await service.searchUsers(PM, 'a');
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(SEARCH_RESULT_LIMIT).toBe(6);
    expect(arg.take).toBe(6);
    expect(arg.orderBy).toEqual([{ name: 'asc' }, { userId: 'asc' }]);
  });

  it('marks archived users and keeps only the safe columns', async () => {
    prisma.user.findMany.mockResolvedValue([
      { userId: 'BS23001', name: 'A', email: 'a@bs23.test', photoPath: null, archivedAt: null },
      { userId: 'BS23005', name: 'B', email: 'b@bs23.test', photoPath: 'p.png', archivedAt: new Date('2026-08-02') },
    ]);
    const { items } = await service.searchUsers(PM, 'x');
    expect(items).toEqual([
      { userId: 'BS23001', name: 'A', email: 'a@bs23.test', photoPath: null, archived: false },
      { userId: 'BS23005', name: 'B', email: 'b@bs23.test', photoPath: 'p.png', archived: true },
    ]);
  });
});
