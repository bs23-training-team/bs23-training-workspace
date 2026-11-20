import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AssessmentModule } from './modules/assessment/assessment.module.js';
import { AttendanceModule } from './modules/attendance/attendance.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { DirectoryModule } from './modules/directory/directory.module.js';
import { EngagementModule } from './modules/engagement/engagement.module.js';
import { GrowthCoreModule } from './modules/growth-core/growth-core.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { LearningModule } from './modules/learning/learning.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OutboxModule } from './modules/outbox/outbox.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { SprintModule } from './modules/sprint/sprint.module.js';

@Module({
  imports: [
    // Loads apps/api/.env locally; on servers the real environment is used.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    // Feature modules (one per owner). Registered once by E11; owners edit only their own module file.
    AssessmentModule,
    AttendanceModule,
    CatalogModule,
    DashboardModule,
    DirectoryModule,
    EngagementModule,
    GrowthCoreModule,
    IdentityModule,
    LearningModule,
    NotificationsModule,
    OutboxModule,
    ReportsModule,
    SprintModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
