import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UserProfileService } from './user-profile.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('UserProfileService.getProfile', () => {
  const prisma = { user: { findFirst: vi.fn() } };
  let service: UserProfileService;

  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'BS23001',
    pmId: 'PM001',
    name: 'Brishty Das',
    email: 'brishty@bs23.test',
    photoPath: null,
    bio: 'Wants to learn APIs.',
    position: 'FULLSTACK',
    resource: 'TRAINEE',
    attendanceMode: 'PHYSICAL',
    onboardDate: new Date('2026-09-01T00:00:00Z'),
    departureDate: new Date('2026-12-01T00:00:00Z'),
    skillAssessmentMinutes: 60,
    skillAssessmentMarks: 100,
    mustChangePassword: false,
    archivedAt: null,
    userSkills: [{ skill: { name: 'SQL' } }, { skill: { name: 'React' } }],
    memberships: [{ team: { id: 't2', name: 'Beta' } }, { team: { id: 't1', name: 'Alpha' } }],
    feedbackVersions: [
      { version: 2, text: 'Better.', authorId: 'PM001', createdAt: new Date('2026-10-02T10:00:00Z'), author: { name: 'Sarah' } },
      { version: 1, text: 'Start.', authorId: 'PM001', createdAt: new Date('2026-10-01T10:00:00Z'), author: { name: 'Sarah' } },
    ],
    ...over,
  });

  beforeEach(async () => {
    prisma.user.findFirst.mockReset().mockResolvedValue(row());
    const moduleRef = await Test.createTestingModule({
      providers: [UserProfileService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(UserProfileService);
  });

  it('only looks inside the PM workspace and says "not found" otherwise', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.getProfile(PM, 'BS99999')).rejects.toThrow('User not found.');
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ userId: 'BS99999', workspaceId: 'ws1' });
  });

  it('only lists current teams (left or archived teams are skipped)', async () => {
    await service.getProfile(PM, 'BS23001');
    const sel = prisma.user.findFirst.mock.calls[0][0].select;
    expect(sel.memberships.where).toEqual({ leftAt: null, team: { archivedAt: null } });
  });

  it('maps the profile: sorted skills and teams, date-only dates, feedback newest first', async () => {
    const p = await service.getProfile(PM, 'BS23001');
    expect(p).toMatchObject({
      userId: 'BS23001',
      onboardDate: '2026-09-01',
      departureDate: '2026-12-01',
      skillAssessmentMinutes: 60,
      skillAssessmentMarks: 100,
      skills: ['React', 'SQL'],
      teams: [
        { id: 't1', name: 'Alpha' },
        { id: 't2', name: 'Beta' },
      ],
      archivedAt: null,
      mustChangePassword: false,
    });
    expect(p.feedback).toEqual([
      { version: 2, text: 'Better.', authorId: 'PM001', authorName: 'Sarah', createdAt: '2026-10-02T10:00:00.000Z' },
      { version: 1, text: 'Start.', authorId: 'PM001', authorName: 'Sarah', createdAt: '2026-10-01T10:00:00.000Z' },
    ]);
  });

  it('reads feedback only for the PM own users and says managedByYou', async () => {
    const own = await service.getProfile(PM, 'BS23001');
    expect(own.managedByYou).toBe(true);
    expect(prisma.user.findFirst.mock.calls[0][0].select.feedbackVersions.where).toEqual({
      user: { pmId: 'PM001' },
    });

    // Another PM's user: the database returns no feedback rows because of that filter.
    prisma.user.findFirst.mockResolvedValue(row({ pmId: 'PM002', feedbackVersions: [] }));
    const other = await service.getProfile(PM, 'BS23002');
    expect(other.managedByYou).toBe(false);
    expect(other.feedback).toEqual([]);
  });

  it('opens an archived user and reactivated user (no departure date)', async () => {
    prisma.user.findFirst.mockResolvedValue(
      row({ archivedAt: new Date('2026-08-02T00:00:00Z'), departureDate: null, feedbackVersions: [] }),
    );
    const p = await service.getProfile(PM, 'BS23005');
    expect(p.archivedAt).toBe('2026-08-02T00:00:00.000Z');
    expect(p.departureDate).toBeNull();
    expect(p.feedback).toEqual([]);
  });
});
