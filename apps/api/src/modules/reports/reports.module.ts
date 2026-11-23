import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { MailService } from './mail.service.js';
import { ReportsAggregator } from './reports.aggregator.js';
import { MyReportsController, ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';
import { ReportsService } from './reports.service.js';

// Owner: E08. Already registered in src/app.module.ts: do not edit app.module.ts.
// Reference shape: src/health/ (docs/architecture.md §3).
@Module({
  imports: [IdentityModule],
  controllers: [ReportsController, MyReportsController],
  providers: [ReportsRepository, ReportsAggregator, MailService, ReportsService],
  exports: [MailService, ReportsService],
})
export class ReportsModule {}
