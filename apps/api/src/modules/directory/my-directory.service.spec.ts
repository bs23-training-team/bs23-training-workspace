import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MAX_BIO_LENGTH, MAX_NAME_LENGTH, MyDirectoryService } from './my-directory.service.js';

describe('MyDirectoryService', () => {
  const prisma = { user: { findFirst: vi.fn(), update: vi.fn() } };
  let service: MyDirectoryService;

  const row = (over: Record<string, unknown> = {}) => ({
    userId: 'BS23001',
    name: 'Brishty Das',
    bio: 'Learn APIs.',
    photoPath: null,
    email: 'brishty@bs23.test',
    position: 'FULLSTACK',
    attendanceMode: 'PHYSICAL',
    onboardDate: new Date('2026-09-01T00:00:00Z'),
    memberships: [{ team: { id: 't2', name: 'Beta' } }, { team: { id: 't1', name: 'Alpha' } }],
    ...over,
  });

  beforeEach(async () => {
    prisma.user.findFirst.mockReset().mockResolvedValue(row());
    prisma.user.update.mockReset().mockResolvedValue(row());
    const moduleRef = await Test.createTestingModule({
      providers: [MyDirectoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(MyDirectoryService);
  });

  describe('getMine', () => {
    it('returns the profile fields and the read-only details, teams sorted, date-only onboarding date', async () => {
      await expect(service.getMine('BS23001')).resolves.toEqual({
        userId: 'BS23001',
        name: 'Brishty Das',
        bio: 'Learn APIs.',
        photoPath: null,
        email: 'brishty@bs23.test',
        position: 'FULLSTACK',
        attendanceMode: 'PHYSICAL',
        teams: [
          { id: 't1', name: 'Alpha' },
          { id: 't2', name: 'Beta' },
        ],
        onboardDate: '2026-09-01',
      });
    });

    it('shows no PM-side private data (no PM, feedback, assessment settings, departure date)', async () => {
      const result = await service.getMine('BS23001');
      for (const key of ['pmId', 'feedback', 'skillAssessmentMinutes', 'departureDate', 'resource']) {
        expect(result).not.toHaveProperty(key);
      }
    });

    it('only asks for an active user and only current teams', async () => {
      await service.getMine('BS23001');
      const arg = prisma.user.findFirst.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'BS23001', archivedAt: null });
      expect(arg.select.memberships.where).toEqual({ leftAt: null, team: { archivedAt: null } });
    });

    it('is "not found" for an unknown or archived user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.getMine('BS99999')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('works for a user in no team', async () => {
      prisma.user.findFirst.mockResolvedValue(row({ memberships: [] }));
      expect((await service.getMine('BS23001')).teams).toEqual([]);
    });
  });

  describe('updateMine', () => {
    it('refuses an empty or blank name', async () => {
      await expect(service.updateMine('BS23001', '   ', 'x')).rejects.toThrow('Display name cannot be empty.');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a name or bio that is too long', async () => {
      await expect(service.updateMine('BS23001', 'x'.repeat(MAX_NAME_LENGTH + 1), '')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.updateMine('BS23001', 'B', 'x'.repeat(MAX_BIO_LENGTH + 1))).rejects.toThrow('at most 1000');
    });

    it('is "not found" for an unknown or archived user', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.updateMine('BS99999', 'B', '')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('changes ONLY name and bio (trimmed); an empty bio is saved as null', async () => {
      await service.updateMine('BS23001', '  New Name ', '   ');
      const arg = prisma.user.update.mock.calls[0][0];
      expect(arg.where).toEqual({ userId: 'BS23001' });
      expect(arg.data).toEqual({ name: 'New Name', bio: null });
      await service.updateMine('BS23001', 'B', ' Learn APIs ');
      expect(prisma.user.update.mock.calls[1][0].data).toEqual({ name: 'B', bio: 'Learn APIs' });
    });

    it('returns the updated page', async () => {
      prisma.user.update.mockResolvedValue(row({ name: 'New Name' }));
      expect((await service.updateMine('BS23001', 'New Name', '')).name).toBe('New Name');
    });
  });
});
