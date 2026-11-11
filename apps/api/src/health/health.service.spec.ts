import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  const prisma = { $queryRaw: vi.fn() };
  let service: HealthService;

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [HealthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(HealthService);
  });

  it('live always reports ok', () => {
    expect(service.live()).toEqual({ status: 'ok', checks: {} });
  });

  it('ready reports ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    await expect(service.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('ready reports error when the database is unreachable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    await expect(service.ready()).resolves.toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
