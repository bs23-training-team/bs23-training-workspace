import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';

import { RATE_LIMIT_KEY } from './decorators/rate-limit.decorator.js';
import { RateLimitGuard } from './guards/rate-limit.guard.js';
import {
    DEFAULT_RATE_LIMITS,
    RateLimitStore,
    envNames,
    resolveRateLimits,
    type RateLimitPolicyName,
} from './rate-limit.js';

describe('RateLimitStore', () => {
    it('allows up to the limit, then refuses until the window ends', () => {
        const store = new RateLimitStore();

        for (let i = 1; i <= 3; i += 1) {
            expect(store.hit('k', 3, 1000, 0).allowed).toBe(true);
        }
        const refused = store.hit('k', 3, 1000, 500);
        expect(refused.allowed).toBe(false);
        expect(refused.retryAfterSeconds).toBe(1);

        expect(store.hit('k', 3, 1000, 1001).allowed).toBe(true);
    });

    it('counts keys separately', () => {
        const store = new RateLimitStore();

        store.hit('a', 1, 1000, 0);
        expect(store.hit('a', 1, 1000, 1).allowed).toBe(false);
        expect(store.hit('b', 1, 1000, 1).allowed).toBe(true);
    });

    it('stays bounded: expired keys go first, then the oldest', () => {
        const store = new RateLimitStore(3);

        store.hit('a', 5, 100, 0);
        store.hit('b', 5, 100, 0);
        store.hit('c', 5, 100, 0);
        store.hit('d', 5, 100, 1000); // a, b, c expired and are swept
        expect(store.size).toBe(1);

        const tight = new RateLimitStore(2);
        tight.hit('a', 5, 10_000, 0);
        tight.hit('b', 5, 10_000, 1);
        tight.hit('c', 5, 10_000, 2); // nothing expired: the oldest (a) is dropped
        expect(tight.size).toBe(2);
        expect(tight.hit('a', 1, 10_000, 3).remaining).toBe(0);
    });
});

describe('resolveRateLimits', () => {
    it('uses the proposed defaults', () => {
        const { policies, problems } = resolveRateLimits(() => undefined);

        expect(problems).toHaveLength(0);
        expect(policies.login).toEqual({ limit: 10, windowSeconds: 900, by: 'ip+identifier' });
        expect(policies['password-reset'].limit).toBe(DEFAULT_RATE_LIMITS['password-reset'].limit);
    });

    it('covers the account-provisioning routes and has no email-verification policy (SEC-06)', () => {
        const { policies } = resolveRateLimits(() => undefined);

        expect(policies['account-provision']).toEqual({ limit: 60, windowSeconds: 3600, by: 'ip' });
        expect(envNames('account-provision').max).toBe('AUTH_RATE_LIMIT_ACCOUNT_PROVISION_MAX');
        expect(Object.keys(policies).filter((name) => name.startsWith('email-verify'))).toEqual([]);
        expect(Object.keys(policies)).not.toContain('invitation-activate');
    });

    it('applies environment overrides', () => {
        const names = envNames('password-forgot-ip');
        expect(names).toEqual({
            max: 'AUTH_RATE_LIMIT_PASSWORD_FORGOT_IP_MAX',
            window: 'AUTH_RATE_LIMIT_PASSWORD_FORGOT_IP_WINDOW_SECONDS',
        });

        const { policies } = resolveRateLimits((v) =>
            v === names.max ? '3' : v === names.window ? '60' : undefined,
        );
        expect(policies['password-forgot-ip']).toMatchObject({ limit: 3, windowSeconds: 60 });
    });

    it('reports an invalid override as an error (the API will not start) and names only the variable', () => {
        const { problems } = resolveRateLimits((v) => (v === 'AUTH_RATE_LIMIT_LOGIN_MAX' ? 'abc' : undefined));

        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatchObject({ level: 'error' });
        expect(problems[0].message).toContain('AUTH_RATE_LIMIT_LOGIN_MAX');
        expect(problems[0].message).not.toContain('abc');
        expect(resolveRateLimits((v) => (v.endsWith('_MAX') ? '0' : undefined)).problems.length).toBeGreaterThan(0);
    });
});

describe('RateLimitGuard', () => {
    function makeGuard(env: Record<string, string> = {}) {
        const handler = () => undefined;
        const reflector = {
            getAllAndOverride: (key: string, targets: unknown[]) =>
                key === RATE_LIMIT_KEY && targets[0] === handler ? currentPolicies : undefined,
        };
        let currentPolicies: RateLimitPolicyName[] | undefined = ['login', 'login-ip'];
        const guard = new RateLimitGuard(reflector as never, new ConfigService(env));
        guard.store = new RateLimitStore();
        const headers: Record<string, string> = {};

        const call = (ip: string, body: unknown = { identifier: 'pm@example.com' }) =>
            guard.canActivate({
                getHandler: () => handler,
                getClass: () => undefined,
                switchToHttp: () => ({
                    getRequest: () => ({ ip, body }),
                    getResponse: () => ({ setHeader: (k: string, v: string) => (headers[k] = v) }),
                }),
            } as never);

        return {
            call,
            headers,
            setPolicies: (names: RateLimitPolicyName[] | undefined) => {
                currentPolicies = names;
            },
        };
    }

    const refused = (run: () => unknown) => {
        try {
            run();
        } catch (error) {
            return error as HttpException;
        }
        return null;
    };

    it('lets a route without a policy through', () => {
        const { call, setPolicies } = makeGuard();
        setPolicies(undefined);

        for (let i = 0; i < 100; i += 1) {
            expect(call('1.1.1.1')).toBe(true);
        }
    });

    it('refuses the 11th login attempt for one identifier with 429 and Retry-After (default limit 10)', () => {
        const { call, headers } = makeGuard();

        for (let i = 1; i <= 10; i += 1) {
            expect(call('1.1.1.1')).toBe(true);
        }
        const error = refused(() => call('1.1.1.1'));

        expect(error).toBeInstanceOf(HttpException);
        expect(error?.getStatus()).toBe(429);
        expect((error?.getResponse() as Record<string, unknown> | undefined)?.message).toBe('Too many attempts. Try again later.');
        expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    });

    it('counts the identifier case-insensitively, and another identifier or another IP separately', () => {
        const { call } = makeGuard({ AUTH_RATE_LIMIT_LOGIN_MAX: '2' });

        call('1.1.1.1', { identifier: 'Pm@Example.com' });
        call('1.1.1.1', { identifier: ' pm@example.com ' });
        expect(refused(() => call('1.1.1.1', { identifier: 'PM@EXAMPLE.COM' }))?.getStatus()).toBe(429);

        expect(call('1.1.1.1', { identifier: 'other@example.com' })).toBe(true);
        expect(call('2.2.2.2', { identifier: 'pm@example.com' })).toBe(true);
    });

    it('also limits one IP across many identifiers (credential stuffing)', () => {
        const { call } = makeGuard({ AUTH_RATE_LIMIT_LOGIN_IP_MAX: '5' });

        for (let i = 0; i < 5; i += 1) {
            call('3.3.3.3', { identifier: `user${i}@example.com` });
        }
        expect(refused(() => call('3.3.3.3', { identifier: 'brand-new@example.com' }))?.getStatus()).toBe(429);
    });

    it('survives a missing or odd body', () => {
        const { call } = makeGuard();

        expect(call('4.4.4.4', undefined)).toBe(true);
        expect(call('4.4.4.4', { identifier: { $ne: null } })).toBe(true);
        expect(call('4.4.4.4', 'text')).toBe(true);
    });

    it('logs only the policy name and IP, never the identifier', () => {
        const lines: string[] = [];
        const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
            lines.push(String(message));
        });

        try {
            const { call } = makeGuard({ AUTH_RATE_LIMIT_LOGIN_MAX: '1' });
            call('5.5.5.5', { identifier: 'secret.person@example.com' });
            refused(() => call('5.5.5.5', { identifier: 'secret.person@example.com' }));
        } finally {
            warn.mockRestore();
        }

        expect(lines.join('\n')).toContain('security_event=rate_limited policy=login');
        expect(lines.join('\n')).not.toContain('secret.person');
    });
});
