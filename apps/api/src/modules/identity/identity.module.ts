import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { AccountProvisioningService } from './account-provisioning.service.js';
import { AccountLifecycleService } from './account-lifecycle.service.js';
import { MailService } from './mail.service.js';
import { ProfileService } from './profile.service.js';
import { ProfilePhotoStorage } from './profile-photo.storage.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { checkJwtConfig } from './jwt-config.js';
import { resolveMailProvider } from './mail-config.js';
import { resolveRateLimits } from './rate-limit.js';

/**
 * Runs when the module is created at startup. Stops the API with a clear
 * message (variable names only, never values) when the JWT, mail or
 * rate-limit environment is unsafe or invalid, instead of failing later at
 * the first login.
 */
const identityConfigCheck = {
    provide: 'IDENTITY_CONFIG_CHECK',
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
        const nodeEnv = config.get<string>('NODE_ENV') ?? process.env.NODE_ENV;

        const problems = [
            ...checkJwtConfig({
                JWT_ACCESS_SECRET: config.get<string>('JWT_ACCESS_SECRET'),
                JWT_REFRESH_SECRET: config.get<string>('JWT_REFRESH_SECRET'),
                WEB_APP_URL: config.get<string>('WEB_APP_URL'),
                NODE_ENV: nodeEnv,
            }),
            ...resolveMailProvider({
                MAIL_PROVIDER: config.get<string>('MAIL_PROVIDER'),
                NODE_ENV: nodeEnv,
            }).problems,
            ...resolveRateLimits((variable) => config.get<string>(variable)).problems,
        ];

        const logger = new Logger('IdentityModule');
        for (const problem of problems.filter((p) => p.level === 'warning')) {
            logger.warn(problem.message);
        }

        const errors = problems.filter((p) => p.level === 'error');
        if (errors.length > 0) {
            throw new Error(
                `Invalid identity configuration: ${errors.map((p) => p.message).join(' ')}`,
            );
        }

        return true;
    },
};

@Module({
    imports: [JwtModule.register({})],
    controllers: [IdentityController],
    providers: [
        IdentityService,
        AccountProvisioningService,
        AccountLifecycleService,
        MailService,
        ProfileService,
        ProfilePhotoStorage,
        JwtAuthGuard,
        RolesGuard,
        RateLimitGuard,
        identityConfigCheck,
    ],
    // Other modules protect their routes with
    // `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('PM')` or `@Roles(...USER_ROLES)`.
    // JwtModule is re-exported because JwtAuthGuard injects JwtService, so a
    // module that imports IdentityModule can instantiate the guard.
    // E02 calls AccountProvisioningService to create PM / user logins.
    exports: [
        IdentityService,
        AccountProvisioningService,
        AccountLifecycleService,
        JwtAuthGuard,
        RolesGuard,
        JwtModule,
    ],
})
export class IdentityModule { }
