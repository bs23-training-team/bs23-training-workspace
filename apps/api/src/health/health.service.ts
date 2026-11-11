import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@bs23/contracts';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The checks behind /health/live and /health/ready.
 * No HTTP here: the controller turns an 'error' result into a 503.
 */
@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  live(): HealthResponse {
    return { status: 'ok', checks: {} };
  }

  async ready(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', checks: { database: 'up' } };
    } catch {
      // Do not leak connection details in the response.
      return { status: 'error', checks: { database: 'down' } };
    }
  }
}
