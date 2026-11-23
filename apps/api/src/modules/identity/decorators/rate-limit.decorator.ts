import { SetMetadata } from '@nestjs/common';

import type { RateLimitPolicyName } from '../rate-limit.js';

export const RATE_LIMIT_KEY = 'identity:rateLimit';

/**
 * Throttle a route with the named policies (see rate-limit.ts). Every listed
 * policy is counted; the request is refused when any one is over its limit.
 * Needs RateLimitGuard: `@UseGuards(RateLimitGuard)` + `@RateLimit('login', 'login-ip')`.
 */
export const RateLimit = (...policies: RateLimitPolicyName[]) =>
    SetMetadata(RATE_LIMIT_KEY, policies);
