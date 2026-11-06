import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@bs23/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Used by hosting platforms, CI smoke tests and monitoring.
 *   /health/live  → the process is running (no dependencies checked)
 *   /health/ready → the API can serve requests (database reachable)
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): HealthResponse {
    return { status: 'ok', checks: {} };
  }

  @Get('ready')
  async ready(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      // Do not leak connection details in the response.
      const body: HealthResponse = { status: 'error', checks: { database: 'down' } };
      throw new ServiceUnavailableException(body);
    }
  }
}
