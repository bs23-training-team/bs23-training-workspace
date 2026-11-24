import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ExportService } from './export.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('ExportService.exportUsers', () => {
  const prisma = { user: { findMany: vi.fn() } };
  let service: ExportService;

  beforeEach(async () => {
    prisma.user.findMany.mockReset().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [ExportService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ExportService);
  });

  it('exports every active user of the workspace: no filter, no paging, no archived users', async () => {
    await service.exportUsers(PM);
    const arg = prisma.user.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ workspaceId: 'ws1', archivedAt: null });
    expect(arg).not.toHaveProperty('take');
    expect(arg).not.toHaveProperty('skip');
    expect(arg.orderBy).toEqual({ userId: 'asc' });
  });

  it('only lists teams the user is in now', async () => {
    await service.exportUsers(PM);
    const sel = prisma.user.findMany.mock.calls[0][0].select;
    expect(sel.memberships.where).toEqual({ leftAt: null, team: { archivedAt: null } });
  });

  it('returns no rows when there are no users', async () => {
    await expect(service.exportUsers(PM)).resolves.toEqual({ rows: [] });
  });

  it('maps a user to a row (sorted skills and teams, date-only dates)', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        userId: 'BS23002',
        name: 'Tanvir',
        email: 't@bs23.test',
        position: 'FRONTEND',
        resource: 'SBU',
        onboardDate: new Date('2026-09-01T00:00:00Z'),
        departureDate: null,
        userSkills: [{ skill: { name: 'React' } }, { skill: { name: 'JavaScript' } }],
        memberships: [{ team: { name: 'Beta' } }, { team: { name: 'Alpha' } }],
      },
    ]);
    const { rows } = await service.exportUsers(PM);
    expect(rows).toEqual([
      {
        userId: 'BS23002',
        name: 'Tanvir',
        email: 't@bs23.test',
        position: 'FRONTEND',
        resource: 'SBU',
        skills: ['JavaScript', 'React'],
        teams: ['Alpha', 'Beta'],
        onboardDate: '2026-09-01',
        departureDate: null,
      },
    ]);
  });
});
