import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MAX_PEERS_PAGE_SIZE } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PeersService } from './peers.service.js';

const ME = { userId: 'BS23001', workspaceId: 'ws1' };

const rows = (n: number, from = 2) =>
  Array.from({ length: n }, (_, i) => ({ userId: `BS2300${from + i}`, name: `Peer ${from + i}` }));

describe('PeersService.listPeers', () => {
  const prisma = { user: { findFirst: vi.fn(), findMany: vi.fn() } };
  let service: PeersService;

  beforeEach(async () => {
    prisma.user.findFirst.mockReset().mockResolvedValue({ pmId: 'PM001' });
    prisma.user.findMany.mockReset().mockResolvedValue(rows(2));
    const moduleRef = await Test.createTestingModule({
      providers: [PeersService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(PeersService);
  });

  it('finds the caller in the caller workspace and says "not found" for an archived or unknown user', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.listPeers(ME, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'BS23001',
      workspaceId: 'ws1',
      archivedAt: null,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('lists active users of the caller own PM group and workspace, without the caller', async () => {
    await service.listPeers(ME, {});
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      workspaceId: 'ws1',
      pmId: 'PM001',
      archivedAt: null,
      userId: { not: 'BS23001' },
    });
    expect(arg.orderBy).toEqual({ userId: 'asc' });
  });

  it('returns only userId and name (the query selects nothing else)', async () => {
    const result = await service.listPeers(ME, {});
    expect(prisma.user.findMany.mock.calls[0][0].select).toEqual({ userId: true, name: true });
    expect(result.items).toEqual([
      { userId: 'BS23002', name: 'Peer 2' },
      { userId: 'BS23003', name: 'Peer 3' },
    ]);
  });

  it('continues after the cursor (keyset on the User ID)', async () => {
    await service.listPeers(ME, { cursor: 'BS23005' });
    expect(prisma.user.findMany.mock.calls[0][0].where.userId).toEqual({ not: 'BS23001', gt: 'BS23005' });
  });

  it('uses 50 rows by default and caps the page at 100 and the minimum at 1', async () => {
    await service.listPeers(ME, {});
    expect(prisma.user.findMany.mock.calls[0][0].take).toBe(51);
    await service.listPeers(ME, { limit: 5000 });
    expect(prisma.user.findMany.mock.calls[1][0].take).toBe(MAX_PEERS_PAGE_SIZE + 1);
    await service.listPeers(ME, { limit: 0 });
    expect(prisma.user.findMany.mock.calls[2][0].take).toBe(2);
  });

  it('gives a nextCursor (the last returned User ID) when there is another page', async () => {
    prisma.user.findMany.mockResolvedValue(rows(3)); // limit 2 + 1 extra row
    const result = await service.listPeers(ME, { limit: 2 });
    expect(result.items.map((i) => i.userId)).toEqual(['BS23002', 'BS23003']);
    expect(result.nextCursor).toBe('BS23003');
  });

  it('gives nextCursor null on the last page and for an empty group', async () => {
    prisma.user.findMany.mockResolvedValue(rows(2));
    await expect(service.listPeers(ME, { limit: 2 })).resolves.toMatchObject({ nextCursor: null });
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.listPeers(ME, {})).resolves.toEqual({ items: [], nextCursor: null });
  });
});
