import { Module } from '@nestjs/common';
import { KudosQueryService } from './kudos-query.service.js';

/**
 * IF-04 on its own, with no dependency on growth-core. growth-core imports THIS module to read
 * kudos for the badge rule KUDOS_DISTINCT_SENDERS, and EngagementModule imports growth-core for
 * the XP ledger. Keeping the kudos reader in its own module is what avoids a module cycle.
 * The FILES must not cycle either: kudos-query.service imports growth-core's leaf files (paging, ports),
 * never growth-core/index (see kudos-query.cycle.spec and engagement-boundaries.spec).
 * (PrismaService comes from the global PrismaModule.)
 */
@Module({
  providers: [KudosQueryService],
  exports: [KudosQueryService],
})
export class KudosQueryModule {}
