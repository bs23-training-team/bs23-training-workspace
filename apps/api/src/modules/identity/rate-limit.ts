/**
 * Rate-limit policies and counter store for the authentication routes (E01).
 *
 * SRS SEC-06 requires throttling on login, password reset and similar routes.
 * The thresholds are NOT agreed yet (SRS OQ-09), so the numbers below are
 * PROPOSED DEFAULTS, every one overridable by environment variable, and no
 * account lockout is implemented (that is a business rule nobody has set).
 *
 * Limits are counted per client IP, and for the credential routes also per
 * submitted identifier, in a fixed window. The counters live in this
 * process's memory:
 *   - they reset when the API restarts;
 *   - with more than one API instance each instance counts on its own, so the
 *     real limit is (limit x instances). A shared store (Redis) is a team
 *     decision, see README "Decisions needed".
 *
 * Pure code (no Nest) so it can be unit tested.
 */

export type RateLimitKeyKind = 'ip' | 'ip+identifier';

export type RateLimitPolicy = {
    limit: number;
    windowSeconds: number;
    by: RateLimitKeyKind;
};

/** Proposed defaults. See the README for the environment variable names. */
export const DEFAULT_RATE_LIMITS = {
    login: { limit: 10, windowSeconds: 900, by: 'ip+identifier' },
    'login-ip': { limit: 50, windowSeconds: 900, by: 'ip' },
    refresh: { limit: 60, windowSeconds: 900, by: 'ip' },
    'password-forgot': { limit: 5, windowSeconds: 3600, by: 'ip+identifier' },
    'password-forgot-ip': { limit: 20, windowSeconds: 3600, by: 'ip' },
    'password-reset': { limit: 10, windowSeconds: 3600, by: 'ip' },
    'email-verify': { limit: 10, windowSeconds: 3600, by: 'ip' },
    'email-verify-request': { limit: 5, windowSeconds: 3600, by: 'ip+identifier' },
    'account-provision': { limit: 60, windowSeconds: 3600, by: 'ip' },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitPolicyName = keyof typeof DEFAULT_RATE_LIMITS;

export type RateLimitProblem = { level: 'error' | 'warning'; message: string };

/** AUTH_RATE_LIMIT_PASSWORD_FORGOT_IP_MAX and ..._WINDOW_SECONDS for "password-forgot-ip". */
export function envNames(name: RateLimitPolicyName): { max: string; window: string } {
    const base = `AUTH_RATE_LIMIT_${name.toUpperCase().replace(/-/g, '_')}`;

    return { max: `${base}_MAX`, window: `${base}_WINDOW_SECONDS` };
}

// undefined = not set, null = set but invalid, number = valid.
const parsePositive = (raw: string | undefined): number | null | undefined => {
    if (raw === undefined || raw.trim() === '') {
        return undefined;
    }

    return /^\d+$/.test(raw.trim()) && Number(raw) > 0 ? Number(raw) : null;
};

/**
 * Defaults with environment overrides applied. A set-but-invalid value is an
 * error (the API refuses to start) rather than silently falling back.
 */
export function resolveRateLimits(
    read: (variable: string) => string | undefined,
): { policies: Record<RateLimitPolicyName, RateLimitPolicy>; problems: RateLimitProblem[] } {
    const problems: RateLimitProblem[] = [];
    const policies = {} as Record<RateLimitPolicyName, RateLimitPolicy>;

    for (const name of Object.keys(DEFAULT_RATE_LIMITS) as RateLimitPolicyName[]) {
        const base: RateLimitPolicy = DEFAULT_RATE_LIMITS[name];
        const names = envNames(name);
        const policy = { ...base };

        for (const [field, variable] of [
            ['limit', names.max],
            ['windowSeconds', names.window],
        ] as const) {
            const raw = read(variable);
            const parsed = parsePositive(raw);

            if (parsed === null) {
                problems.push({
                    level: 'error',
                    message: `${variable} must be a positive whole number.`,
                });
            } else if (parsed !== undefined) {
                policy[field] = parsed;
            }
        }

        policies[name] = policy;
    }

    return { policies, problems };
}

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

/** Fixed-window counters with a hard cap on how many keys are remembered. */
export class RateLimitStore {
    private readonly buckets = new Map<string, Bucket>();

    constructor(private readonly maxKeys = 10_000) { }

    get size(): number {
        return this.buckets.size;
    }

    hit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
        let bucket = this.buckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            this.makeRoom(now);
            bucket = { count: 0, resetAt: now + windowMs };
            this.buckets.set(key, bucket);
        }

        bucket.count += 1;

        const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

        return {
            allowed: bucket.count <= limit,
            remaining: Math.max(0, limit - bucket.count),
            retryAfterSeconds,
        };
    }

    // Keeps memory bounded. Expired buckets go first; if the store is still
    // full the oldest bucket is dropped (a flood of unique keys can therefore
    // evict real counters: another reason to use a shared store later).
    private makeRoom(now: number): void {
        if (this.buckets.size < this.maxKeys) {
            return;
        }

        for (const [key, bucket] of this.buckets) {
            if (bucket.resetAt <= now) {
                this.buckets.delete(key);
            }
        }

        while (this.buckets.size >= this.maxKeys) {
            const oldest = this.buckets.keys().next();

            if (oldest.done) {
                break;
            }

            this.buckets.delete(oldest.value);
        }
    }
}
