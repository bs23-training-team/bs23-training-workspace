import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * The single Prisma client for the whole API. Inject it in any module:
 *   constructor(private readonly prisma: PrismaService) {}
 *
 * Uses DATABASE_URL (the pooled connection on Neon). Migrations use DIRECT_URL
 * through prisma.config.ts, never this client.
 *
 * The connection is opened lazily on the first query, so the API still starts
 * when the database is down. GET /health/ready reports the database state.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
