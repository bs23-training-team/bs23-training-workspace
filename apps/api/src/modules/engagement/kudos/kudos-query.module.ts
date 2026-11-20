import { Module } from '@nestjs/common';
import { KudosQueryService } from './kudos-query.service.js';

/**
 * IF-04 on its own, with no dependency on growth-core. growth-core imports THIS module to read
 * kudos for the badge rule KUDOS_DISTINCT_SENDERS, and EngagementModule imports growth-core for
 * the XP ledger. Keeping the kudos reader in its own module is what avoids a module cycle.
 * (PrismaService comes from the global PrismaModule.)
 */
@Module({
  providers: [KudosQueryService],
  exports: [KudosQueryService],
})
export class KudosQueryModule {}
