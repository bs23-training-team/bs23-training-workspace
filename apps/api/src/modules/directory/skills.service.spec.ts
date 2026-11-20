import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SkillsService } from './skills.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('SkillsService.listSkills', () => {
  const prisma = { skill: { findMany: vi.fn() } };
  let service: SkillsService;

  beforeEach(async () => {
    prisma.skill.findMany.mockReset().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [SkillsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(SkillsService);
  });

  it('lists only active skills of the PM workspace, sorted by name', async () => {
    prisma.skill.findMany.mockResolvedValue([{ name: 'HTML & CSS' }, { name: 'React' }]);
    await expect(service.listSkills(PM)).resolves.toEqual({ items: ['HTML & CSS', 'React'] });
    const arg = prisma.skill.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ workspaceId: 'ws1', isActive: true });
    expect(arg.orderBy).toEqual({ name: 'asc' });
    expect(arg.select).toEqual({ name: true });
  });

  it('returns an empty list when there are no skills', async () => {
    await expect(service.listSkills(PM)).resolves.toEqual({ items: [] });
  });
});
