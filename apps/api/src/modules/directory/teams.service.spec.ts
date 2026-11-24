import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_TEAM_NAME_LENGTH, TeamsService } from './teams.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('TeamsService', () => {
  const prisma = {
    team: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  };
  let service: TeamsService;

  beforeEach(async () => {
    prisma.team.findMany.mockReset().mockResolvedValue([]);
    prisma.team.findFirst.mockReset().mockResolvedValue(null);
    prisma.team.create.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [TeamsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(TeamsService);
  });

  describe('listTeams', () => {

    it('lists active teams of the workspace (not only the PM own teams)', async () => {
      await service.listTeams(PM);
      const arg = prisma.team.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ workspaceId: 'ws1', archivedAt: null });
    });

    it('only counts current members who are not archived', async () => {
      await service.listTeams(PM);
      const arg = prisma.team.findMany.mock.calls[0][0];
      expect(arg.select.memberships.where).toEqual({ leftAt: null, user: { archivedAt: null } });
    });

    it('maps a team with its members and member count', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          id: 't1',
          name: 'Alpha',
          pmId: 'PM001',
          pm: { name: 'Sarah Ahmed' },
          memberships: [
            { user: { userId: 'BS23001', name: 'Brishty', position: 'FULLSTACK' } },
            { user: { userId: 'BS23002', name: 'Tanvir', position: 'FRONTEND' } },
          ],
        },
      ]);
      const { items } = await service.listTeams(PM);
      expect(items).toEqual([
        {
          id: 't1',
          name: 'Alpha',
          pmId: 'PM001',
          pmName: 'Sarah Ahmed',
          memberCount: 2,
          members: [
            { userId: 'BS23001', name: 'Brishty', position: 'FULLSTACK' },
            { userId: 'BS23002', name: 'Tanvir', position: 'FRONTEND' },
          ],
          managedByYou: true,
        },
      ]);
    });

    it('says managedByYou: false for a team owned by another PM', async () => {
      prisma.team.findMany.mockResolvedValue([
        { id: 't1', name: 'Alpha', pmId: 'PM001', pm: { name: 'Sarah' }, memberships: [] },
        { id: 't2', name: 'Beta', pmId: 'PM002', pm: { name: 'Rafi' }, memberships: [] },
      ]);
      const { items } = await service.listTeams(PM);
      expect(items.map((t) => [t.id, t.managedByYou])).toEqual([
        ['t1', true],
        ['t2', false],
      ]);
    });
  });

  describe('createTeam', () => {

    it('rejects an empty or blank name', async () => {
      await expect(service.createTeam(PM, '   ')).rejects.toThrow('Enter a team name.');
      await expect(service.createTeam(PM, '')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects a name that is too long', async () => {
      await expect(service.createTeam(PM, 'x'.repeat(MAX_TEAM_NAME_LENGTH + 1))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects a duplicate name ignoring upper/lower case', async () => {
      prisma.team.findFirst.mockResolvedValue({ id: 't1' });
      await expect(service.createTeam(PM, ' alpha ')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.team.findFirst.mock.calls[0][0].where).toEqual({
        workspaceId: 'ws1',
        name: { equals: 'alpha', mode: 'insensitive' },
      });
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('creates the team with the trimmed name and the creating PM', async () => {
      prisma.team.create.mockResolvedValue({ id: 't9', name: 'Delta', pmId: 'PM001', pm: { name: 'Sarah Ahmed' } });
      const result = await service.createTeam(PM, '  Delta ');
      expect(prisma.team.create.mock.calls[0][0].data).toEqual({ workspaceId: 'ws1', name: 'Delta', pmId: 'PM001' });
      expect(result).toEqual({
        id: 't9',
        name: 'Delta',
        pmId: 'PM001',
        pmName: 'Sarah Ahmed',
        memberCount: 0,
        members: [],
        managedByYou: true,
      });
    });
  });
});
