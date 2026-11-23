import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';
import { archiveDepartedUsers } from './lifecycle.js';

/**
 * Nest wrapper around the departure-date job (PRD FR-AUTH-06, FR-DIR-06) so a
 * scheduler or another module can run it. It is NOT exposed over HTTP; the
 * production schedule (daily) is configured by whoever operates the
 * deployment, or by running cli/archive-departed-users.ts from a cron job.
 */
@Injectable()
export class AccountLifecycleService {
    private readonly logger = new Logger('Security');

    constructor(@Inject(PrismaService) private readonly prisma: PrismaService) { }

    async archiveDepartedUsers(now: Date = new Date()): Promise<{ archived: number }> {
        const result = await archiveDepartedUsers(this.prisma, now);

        if (result.archived > 0) {
            this.logger.log(`security_event=users_archived count=${result.archived}`);
        }

        return result;
    }
}
