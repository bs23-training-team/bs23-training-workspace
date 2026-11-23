import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { createHash } from 'node:crypto';

import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator.js';
import {
    RateLimitStore,
    resolveRateLimits,
    type RateLimitPolicy,
    type RateLimitPolicyName,
} from '../rate-limit.js';

// One counter store per process, shared by every route.
const sharedStore = new RateLimitStore();

const hashShort = (value: string) =>
    createHash('sha256').update(value).digest('hex').slice(0, 16);

/**
 * Counts requests per client IP (and per submitted identifier for the
 * credential routes) and answers 429 with a Retry-After header when a limit is
 * exceeded. Runs BEFORE validation, so it reads the raw body defensively.
 *
 * The client IP is `request.ip`. Behind a reverse proxy Express only reports
 * the real client when "trust proxy" is configured (main.ts, owned by E11); the
 * X-Forwarded-For header is never read here because a client can forge it.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
    private readonly logger = new Logger('Security');
    private policies?: Record<RateLimitPolicyName, RateLimitPolicy>;

    /** Counter store. Tests replace it; production uses the process-wide one. */
    store: RateLimitStore = sharedStore;

    constructor(
        @Inject(Reflector) private readonly reflector: Reflector,
        @Inject(ConfigService) private readonly config: ConfigService,
    ) { }

    canActivate(context: ExecutionContext): boolean {
        const names = this.reflector.getAllAndOverride<RateLimitPolicyName[]>(
            RATE_LIMIT_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!names || names.length === 0) {
            return true;
        }

        const http = context.switchToHttp();
        const request = http.getRequest();
        const policies = this.resolvePolicies();
        const ip = String(request.ip ?? request.socket?.remoteAddress ?? 'unknown');
        const identifier = this.identifierOf(request.body);

        let blockedBy: { name: string; retryAfterSeconds: number } | null = null;

        for (const name of names) {
            const policy = policies[name];
            const key =
                policy.by === 'ip+identifier'
                    ? `${name}|${ip}|${identifier}`
                    : `${name}|${ip}`;
            const result = this.store.hit(key, policy.limit, policy.windowSeconds * 1000);

            if (!result.allowed && !blockedBy) {
                blockedBy = { name, retryAfterSeconds: result.retryAfterSeconds };
            }
        }

        if (!blockedBy) {
            return true;
        }

        // Never log the identifier or any credential, only which limit fired.
        this.logger.warn(`security_event=rate_limited policy=${blockedBy.name} ip=${ip}`);
        http.getResponse()?.setHeader?.('Retry-After', String(blockedBy.retryAfterSeconds));

        throw new HttpException(
            {
                statusCode: HttpStatus.TOO_MANY_REQUESTS,
                error: 'Too Many Requests',
                message: 'Too many attempts. Try again later.',
                retryAfterSeconds: blockedBy.retryAfterSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    private resolvePolicies() {
        this.policies ??= resolveRateLimits((variable) =>
            this.config.get<string>(variable),
        ).policies;

        return this.policies;
    }

    // The email / Trainee ID the client submitted, lower-cased and hashed so
    // the counter key never holds a readable identifier.
    private identifierOf(body: unknown): string {
        const record = (body ?? {}) as Record<string, unknown>;
        const raw = record.identifier ?? record.email ?? record.workEmail;

        return typeof raw === 'string' ? hashShort(raw.trim().toLowerCase()) : 'none';
    }
}
