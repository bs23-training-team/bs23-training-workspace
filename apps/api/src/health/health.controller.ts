import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@bs23/contracts';
import { HealthService } from './health.service.js';

/**
 * Used by hosting platforms, CI smoke tests and monitoring.
 *   /health/live  → the process is running (no dependencies checked)
 *   /health/ready → the API can serve requests (database reachable)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  live(): HealthResponse {
    return this.health.live();
  }

  @Get('ready')
  async ready(): Promise<HealthResponse> {
    const result = await this.health.ready();
    if (result.status === 'error') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
