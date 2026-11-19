import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  const health = { live: vi.fn(), ready: vi.fn() };
  let controller: HealthController;

  beforeEach(async () => {
    health.live.mockReset();
    health.ready.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: health }],
    }).compile();
    controller = moduleRef.get(HealthController);
  });

  it('live returns what the service returns', () => {
    health.live.mockReturnValue({ status: 'ok', checks: {} });
    expect(controller.live()).toEqual({ status: 'ok', checks: {} });
  });

  it('ready returns the body when the service says ok', async () => {
    health.ready.mockResolvedValue({ status: 'ok', checks: { database: 'up' } });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('ready returns 503 when the service says error', async () => {
    health.ready.mockResolvedValue({ status: 'error', checks: { database: 'down' } });
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
