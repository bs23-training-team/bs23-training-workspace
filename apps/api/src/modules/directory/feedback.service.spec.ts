import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeedbackService, MAX_FEEDBACK_LENGTH } from './feedback.service.js';

const PM = { pmId: 'PM001', workspaceId: 'ws1' };

describe('FeedbackService.saveFeedback', () => {
  const prisma = {
    user: { findFirst: vi.fn() },
    feedbackVersion: { findFirst: vi.fn(), create: vi.fn() },
  };
  let service: FeedbackService;

  beforeEach(async () => {
    prisma.user.findFirst.mockReset().mockResolvedValue({ userId: 'BS23001', pmId: 'PM001' });
    prisma.feedbackVersion.findFirst.mockReset().mockResolvedValue({ version: 2 });
    prisma.feedbackVersion.create.mockReset().mockResolvedValue({
      version: 3,
      text: 'Great.',
      authorId: 'PM001',
      createdAt: new Date('2026-11-20T10:00:00Z'),
      author: { name: 'Sarah' },
    });
    const moduleRef = await Test.createTestingModule({
      providers: [FeedbackService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(FeedbackService);
  });

  it('rejects empty or blank feedback without touching the database', async () => {
    await expect(service.saveFeedback(PM, 'BS23001', '   ')).rejects.toThrow('Feedback cannot be empty.');
    expect(prisma.feedbackVersion.create).not.toHaveBeenCalled();
  });

  it('rejects feedback that is too long', async () => {
    await expect(
      service.saveFeedback(PM, 'BS23001', 'x'.repeat(MAX_FEEDBACK_LENGTH + 1)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('says "not found" for a user outside the PM workspace', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.saveFeedback(PM, 'BS99999', 'ok')).rejects.toThrow('User not found.');
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ userId: 'BS99999', workspaceId: 'ws1' });
  });

  it('answers FORBIDDEN_SCOPE for a user managed by another PM and writes nothing', async () => {
    prisma.user.findFirst.mockResolvedValue({ userId: 'BS23002', pmId: 'PM002' });
    const error = await service.saveFeedback(PM, 'BS23002', 'Hello').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'FORBIDDEN_SCOPE' });
    expect(prisma.feedbackVersion.findFirst).not.toHaveBeenCalled();
    expect(prisma.feedbackVersion.create).not.toHaveBeenCalled();
  });

  it('adds a NEW version (latest + 1) with the trimmed text and the PM as author', async () => {
    const result = await service.saveFeedback(PM, 'BS23001', '  Great.  ');
    expect(prisma.feedbackVersion.create.mock.calls[0][0].data).toEqual({
      workspaceId: 'ws1',
      userId: 'BS23001',
      authorId: 'PM001',
      version: 3,
      text: 'Great.',
    });
    expect(result).toEqual({
      version: 3,
      text: 'Great.',
      authorId: 'PM001',
      authorName: 'Sarah',
      createdAt: '2026-11-20T10:00:00.000Z',
    });
  });

  it('starts at version 1 when there is no feedback yet', async () => {
    prisma.feedbackVersion.findFirst.mockResolvedValue(null);
    await service.saveFeedback(PM, 'BS23001', 'First');
    expect(prisma.feedbackVersion.create.mock.calls[0][0].data.version).toBe(1);
  });

  it('turns a same-moment duplicate version into a clear conflict', async () => {
    prisma.feedbackVersion.create.mockRejectedValue({ code: 'P2002' });
    await expect(service.saveFeedback(PM, 'BS23001', 'x')).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not hide other database errors', async () => {
    prisma.feedbackVersion.create.mockRejectedValue(new Error('db down'));
    await expect(service.saveFeedback(PM, 'BS23001', 'x')).rejects.toThrow('db down');
  });
});
