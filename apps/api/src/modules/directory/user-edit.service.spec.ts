import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { UpdateUserRequest } from '@bs23/contracts';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UserEditService } from './user-edit.service.js';
import { UserProfileService } from './user-profile.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('UserEditService.updateUser', () => {
  const prisma = {
    pm: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn() },
    team: { findMany: vi.fn() },
    membership: { findMany: vi.fn(), updateMany: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  const profiles = { getProfile: vi.fn() };
  let service: UserEditService;

  const valid = (over: Partial<UpdateUserRequest> = {}): UpdateUserRequest => ({
    name: ' Brishty Das ',
    email: ' brishty@bs23.test ',
    position: 'FULLSTACK',
    resource: 'TRAINEE',
    attendanceMode: 'PHYSICAL',
    onboardDate: '2026-11-01',
    departureDate: '2027-01-31',
    teamIds: ['t1'],
    ...over,
  });

  const run = (over: Partial<UpdateUserRequest> = {}) => service.updateUser(PM, 'BS23001', valid(over));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));

    prisma.pm.findFirst.mockReset().mockResolvedValue(null);
    prisma.user.findFirst.mockReset().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      // 1st kind of call: the user being edited. 2nd kind: "someone else with this email".
      where.userId === 'BS23001'
        ? Promise.resolve({ archivedAt: null, departureDate: new Date('2027-01-31T00:00:00Z') })
        : Promise.resolve(null),
    );
    prisma.user.update.mockReset().mockResolvedValue({});
    prisma.team.findMany.mockReset().mockResolvedValue([{ id: 't1' }]);
    prisma.membership.findMany.mockReset().mockResolvedValue([{ teamId: 't1' }]);
    prisma.membership.updateMany.mockReset().mockResolvedValue({ count: 1 });
    prisma.membership.upsert.mockReset().mockResolvedValue({});
    prisma.$transaction.mockReset().mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma));
    profiles.getProfile.mockReset().mockResolvedValue({ userId: 'BS23001' });

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserEditService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserProfileService, useValue: profiles },
      ],
    }).compile();
    service = moduleRef.get(UserEditService);
  });

  afterEach(() => vi.useRealTimers());

  describe('who and what', () => {

    it('says "not found" for a user outside the PM workspace', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(run()).rejects.toThrow('User not found.');
      expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ userId: 'BS23001', workspaceId: 'ws1' });
    });
  });

  describe('validation', () => {
    it.each([
      [{ name: '  ' }, 'Fill in every required field.'],
      [{ email: '' }, 'Fill in every required field.'],
      [{ onboardDate: '' }, 'Fill in every required field.'],
      [{ email: 'not-an-email' }, 'Enter a valid email address.'],
      [{ teamIds: [] }, 'Choose a team.'],
      [{ skillAssessmentMinutes: 0 }, 'Time allowed must be a whole number from 1 to 180 minutes.'],
      [{ skillAssessmentMinutes: 181 }, 'Time allowed must be a whole number from 1 to 180 minutes.'],
      [{ skillAssessmentMinutes: 20.5 }, 'Time allowed must be a whole number from 1 to 180 minutes.'],
      [{ skillAssessmentMarks: 0 }, 'Total marks must be a whole number from 1 to 1000.'],
      [{ skillAssessmentMarks: 1001 }, 'Total marks must be a whole number from 1 to 1000.'],
      [{ onboardDate: '01/11/2026' }, 'Enter dates as YYYY-MM-DD.'],
      [{ onboardDate: '2026-02-30' }, 'Enter dates as YYYY-MM-DD.'],
      [{ departureDate: 'soon' }, 'Enter dates as YYYY-MM-DD.'],
    ] as const)('rejects %j', async (over, message) => {
      await expect(run(over as Partial<UpdateUserRequest>)).rejects.toThrow(message);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('accepts the limits 1/180 minutes and 1/1000 marks', async () => {
      await run({ skillAssessmentMinutes: 180, skillAssessmentMarks: 1 });
      await run({ skillAssessmentMinutes: 1, skillAssessmentMarks: 1000 });
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('departure date', () => {
    it('must be after the onboarding date', async () => {
      await expect(run({ departureDate: '2026-11-01' })).rejects.toThrow(
        'The departure date must be after the onboarding date.',
      );
    });

    it('a changed date must be after today', async () => {
      await expect(run({ departureDate: '2026-11-20' })).rejects.toThrow(
        'The departure date has already passed. Choose a date after today.',
      );
      await expect(run({ departureDate: '2026-11-10' })).rejects.toThrow(
        'The departure date has already passed.',
      );
    });

    it('an unchanged date is fine even if it is already close or past', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.userId === 'BS23001' ? { archivedAt: null, departureDate: new Date('2026-11-15T00:00:00Z') } : null,
        ),
      );
      await run({ departureDate: '2026-11-15' });
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('cannot be removed when the user already has one', async () => {
      await expect(run({ departureDate: null })).rejects.toThrow('Choose a departure date.');
    });

    it('may stay empty for a user who has none (reactivated earlier)', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.userId === 'BS23001' ? { archivedAt: null, departureDate: null } : null),
      );
      await run({ departureDate: null });
      expect(prisma.user.update.mock.calls[0][0].data.departureDate).toBeNull();
    });
  });

  describe('archived user', () => {
    beforeEach(() => {
      prisma.user.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.userId === 'BS23001'
            ? { archivedAt: new Date('2026-08-02T00:00:00Z'), departureDate: new Date('2026-08-01T00:00:00Z') }
            : null,
        ),
      );
    });

    it('needs a new departure date after today', async () => {
      const message = 'Set a new departure date after today to move this user back to All Users.';
      await expect(run({ departureDate: null })).rejects.toThrow(message);
      await expect(run({ departureDate: '2026-11-20' })).rejects.toThrow(message);
    });

    it('is reactivated (archivedAt cleared) by a new departure date', async () => {
      await run({ departureDate: '2027-03-01' });
      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({ archivedAt: null });
    });
  });

  describe('email', () => {
    it('is refused when another user has it (ignoring upper/lower case)', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          where.userId === 'BS23001'
            ? { archivedAt: null, departureDate: new Date('2027-01-31T00:00:00Z') }
            : { userId: 'BS23002' },
        ),
      );
      await expect(run()).rejects.toBeInstanceOf(ConflictException);
    });

    it('is refused when a PM has it', async () => {
      prisma.pm.findFirst.mockResolvedValue({ pmId: 'PM001' });
      await expect(run()).rejects.toThrow('An account with this email already exists.');
    });

    it('does not count the user own current email as a duplicate', async () => {
      await run();
      const dup = prisma.user.findFirst.mock.calls.find((c) => c[0].where.NOT)?.[0].where;
      expect(dup).toMatchObject({ NOT: { userId: 'BS23001' } });
    });
  });

  describe('teams', () => {
    it('refuses a team that does not exist, is archived or is in another workspace', async () => {
      prisma.team.findMany.mockResolvedValue([]);
      await expect(run()).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.team.findMany.mock.calls[0][0].where).toEqual({
        id: { in: ['t1'] },
        workspaceId: 'ws1',
        archivedAt: null,
      });
    });

    it('ignores a team id that is sent twice', async () => {
      await run({ teamIds: ['t1', 't1'] });
      expect(prisma.team.findMany.mock.calls[0][0].where.id).toEqual({ in: ['t1'] });
    });

    it('does nothing to memberships when the teams are unchanged', async () => {
      await run();
      expect(prisma.membership.updateMany).not.toHaveBeenCalled();
      expect(prisma.membership.upsert).not.toHaveBeenCalled();
    });

    it('sets leftAt (never deletes) for a team the user leaves', async () => {
      prisma.membership.findMany.mockResolvedValue([{ teamId: 't1' }, { teamId: 't2' }]);
      await run({ teamIds: ['t1'] });
      const call = prisma.membership.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ userId: 'BS23001', teamId: { in: ['t2'] }, leftAt: null });
      expect(call.data.leftAt).toEqual(new Date('2026-11-20T10:00:00Z'));
    });

    it('adds a new team, or clears leftAt when the user goes back to an old one', async () => {
      prisma.team.findMany.mockResolvedValue([{ id: 't1' }, { id: 't3' }]);
      await run({ teamIds: ['t1', 't3'] });
      expect(prisma.membership.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.membership.upsert.mock.calls[0][0]).toEqual({
        where: { teamId_userId: { teamId: 't3', userId: 'BS23001' } },
        create: { workspaceId: 'ws1', teamId: 't3', userId: 'BS23001' },
        update: { leftAt: null },
      });
    });
  });

  describe('saving', () => {
    it('saves trimmed values, never touches the User ID, and returns the new profile', async () => {
      const result = await run({ skillAssessmentMinutes: 30 });
      const { where, data } = prisma.user.update.mock.calls[0][0];
      expect(where).toEqual({ userId: 'BS23001' });
      expect(data).toMatchObject({
        name: 'Brishty Das',
        email: 'brishty@bs23.test',
        position: 'FULLSTACK',
        resource: 'TRAINEE',
        attendanceMode: 'PHYSICAL',
        onboardDate: new Date('2026-11-01T00:00:00Z'),
        departureDate: new Date('2027-01-31T00:00:00Z'),
        skillAssessmentMinutes: 30,
      });
      expect(data).not.toHaveProperty('userId');
      expect(data).not.toHaveProperty('skillAssessmentMarks'); // left out = unchanged
      expect(data).not.toHaveProperty('archivedAt'); // an active user stays active
      expect(profiles.getProfile).toHaveBeenCalledWith(PM, 'BS23001');
      expect(result).toEqual({ userId: 'BS23001' });
    });

    it('does the user update and the team changes in one transaction', async () => {
      await run();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
