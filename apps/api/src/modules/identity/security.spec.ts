import { Logger } from '@nestjs/common';

import { createHmac } from 'node:crypto';

import {
    NEW_PASSWORD,
    PASSWORD,
    makeHarness,
    seedAccounts,
} from '../../../test/support/identity-harness.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

const LEVELS = ['log', 'warn', 'error', 'debug', 'verbose'] as const;

/** Runs `run` while recording everything any Nest Logger writes. */
async function recordLogs(run: () => Promise<void>): Promise<string> {
    const lines: string[] = [];
    const saved: Record<string, unknown> = {};

    for (const level of LEVELS) {
        saved[level] = (Logger.prototype as any)[level];
        (Logger.prototype as any)[level] = function (message: unknown, ...rest: unknown[]) {
            lines.push([message, ...rest].map((part) => JSON.stringify(part)).join(' '));
        };
    }

    try {
        await run();
    } finally {
        for (const level of LEVELS) {
            (Logger.prototype as any)[level] = saved[level];
        }
    }

    return lines.join('\n');
}

describe('security events and secrets (SEC-09)', () => {
    it('no password, JWT, refresh token, reset token or hash ever reaches the logs', async () => {
        const secrets: string[] = [PASSWORD, NEW_PASSWORD];

        const output = await recordLogs(async () => {
            const h = await makeHarness({ IDENTITY_EXPOSE_DEV_TOKENS: 'true' });
            await seedAccounts(h);

            await expect(
                h.service.login({ identifier: 'pm001@bs23.test', password: 'WrongPass123' }),
            ).rejects.toThrow('Invalid credentials.');
            await expect(
                h.service.login({ identifier: 'nobody@bs23.test', password: 'WrongPass123' }),
            ).rejects.toThrow('Invalid credentials.');

            const login = await h.service.login({ identifier: 'pm001@bs23.test', password: PASSWORD });
            secrets.push(login.accessToken, login.refreshToken);
            const rotated = await h.service.refresh(login.refreshToken);
            secrets.push(rotated.accessToken, rotated.refreshToken);
            // Replaying the old token is theft: logged as an event, without the token.
            await expect(h.service.refresh(login.refreshToken)).rejects.toThrow();

            const second = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
            secrets.push(second.accessToken, second.refreshToken);
            const forgot = await h.service.forgotPassword({ workEmail: 'bs23001@bs23.test' });
            secrets.push(forgot.resetToken as string);
            await h.service.resetPassword({ token: forgot.resetToken as string, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

            const actor = h.db.rows('pm')[0];
            const created = await h.provisioning.createPm(
                { sub: actor.pmId, role: 'PM', workspaceId: actor.workspaceId },
                { pmId: 'PM002', name: 'Second', email: 'second@example.com', password: 'Temp0rary!pw1' },
            );
            secrets.push(created.verificationToken as string, 'Temp0rary!pw1');
            secrets.push(...h.db.rows('credential').map((row) => row.passwordHash as string));

            // Add Trainee, a verification re-request, and the first-login password change.
            const team = h.db.addTeam({ workspaceId: actor.workspaceId, pmId: actor.pmId });
            const traineeActor = { sub: actor.pmId, role: 'PM' as const, workspaceId: actor.workspaceId };
            await h.provisioning.createTrainee(traineeActor, {
                userId: 'BS23010', name: 'Temp Trainee', email: 'temp.trainee@example.com',
                temporaryPassword: 'Tr@inee-temp-pw1',
                position: 'QA', attendanceMode: 'ONLINE', onboardDate: '2026-02-01',
                departureDate: new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10),
                skillAssessmentMinutes: 30, skillAssessmentMarks: 50, teamIds: [team.id],
            });
            secrets.push('Tr@inee-temp-pw1');
            const requested = await h.service.requestVerification({ email: 'second@example.com' });
            secrets.push(requested.verificationToken as string);
            const traineeLogin = await h.service.login({ identifier: 'BS23010', password: 'Tr@inee-temp-pw1' });
            secrets.push(traineeLogin.accessToken, traineeLogin.refreshToken);
            await h.service.changePassword(
                'USER', 'BS23010', actor.workspaceId, h.db.rows('session').at(-1)!.id as string,
                { currentPassword: 'Tr@inee-temp-pw1', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
            );
        });

        expect(output).toContain('security_event=login_failed');
        expect(output).toContain('security_event=login_succeeded');
        expect(output).toContain('security_event=refresh_reuse_detected');
        expect(output).toContain('security_event=password_reset_completed');
        expect(output).toContain('security_event=pm_provisioned');
        expect(output).toContain('security_event=trainee_provisioned');
        expect(output).toContain('security_event=verification_requested');
        expect(output).toContain('security_event=password_changed');
        for (const secret of secrets) {
            expect(output).not.toContain(secret);
        }
        // Emails are not logged either (they identify a person).
        expect(output).not.toContain('pm001@bs23.test');
        expect(output).not.toContain('second@example.com');
        expect(output).not.toContain('temp.trainee@example.com');
    });

    it('ordinary responses never contain a password, a hash or a stored token hash', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });

        const bodies = [
            login,
            await h.service.me('USER', 'BS23001'),
            await h.service.listSessions('USER', 'BS23001', 'x'),
            await h.service.forgotPassword({ workEmail: 'bs23001@bs23.test' }),
        ];
        const text = JSON.stringify(bodies);

        expect(text).not.toContain(PASSWORD);
        expect(text).not.toMatch(/[0-9a-f]{32}:[0-9a-f]{128}/);
        expect(text).not.toContain('passwordHash');
        expect(text).not.toContain('tokenHash');
        // Without the dev flag the reset token is not returned.
        expect(Object.keys(bodies[3])).toEqual(['message']);
    });
});

describe('JWT hardening', () => {
    const run = (h: Awaited<ReturnType<typeof makeHarness>>) => {
        const guard = new JwtAuthGuard(
            h.jwt,
            h.config,
            h.db as never,
            { getAllAndOverride: () => true } as never,
        );

        return (token: string) =>
            guard.canActivate({
                getHandler: () => undefined,
                getClass: () => undefined,
                switchToHttp: () => ({
                    getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
                }),
            } as never);
    };

    it('rejects an expired access token', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const payload = JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString());
        const expired = await h.jwt.signAsync(
            { sub: payload.sub, sid: payload.sid, workspaceId: payload.workspaceId, role: payload.role },
            { secret: 'a'.repeat(40), algorithm: 'HS256', expiresIn: -10 },
        );

        await expect(run(h)(expired)).rejects.toThrow('Invalid or expired access token.');
    });

    // Tokens built by hand with node:crypto, so the check does not depend on
    // which JWT library produced them.
    const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const handMade = (alg: string, secret: string | null, claims: Record<string, unknown>) => {
        const head = `${b64({ alg, typ: 'JWT' })}.${b64(claims)}`;
        const signature =
            secret === null
                ? ''
                : createHmac(alg === 'HS512' ? 'sha512' : 'sha256', secret).update(head).digest('base64url');

        return `${head}.${signature}`;
    };

    it('rejects a token signed with the wrong secret, an unsigned token and another algorithm', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const payload = JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString());
        const claims = {
            sub: payload.sub,
            sid: payload.sid,
            workspaceId: payload.workspaceId,
            role: 'PM',
            exp: Math.floor(Date.now() / 1000) + 600,
        };

        const tokens = [
            handMade('HS256', 'x'.repeat(40), claims), // wrong secret
            handMade('HS512', 'a'.repeat(40), claims), // right secret, other algorithm
            handMade('none', null, claims), // unsigned
        ];

        for (const token of tokens) {
            await expect(run(h)(token)).rejects.toThrow('Invalid or expired access token.');
        }
    });

    it('a Trainee token carrying a forged role: "PM" claim still resolves to USER', async () => {
        const h = await makeHarness();
        await seedAccounts(h);
        const login = await h.service.login({ identifier: 'BS23001', password: PASSWORD });
        const payload = JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString());
        // Even a correctly signed token with an inflated role claim changes nothing:
        const inflated = await h.jwt.signAsync(
            { sub: payload.sub, sid: payload.sid, workspaceId: 'other', role: 'PM' },
            { secret: 'a'.repeat(40), algorithm: 'HS256', expiresIn: '15m' },
        );
        const request: Record<string, any> = { headers: { authorization: `Bearer ${inflated}` } };
        const guard = new JwtAuthGuard(h.jwt, h.config, h.db as never, { getAllAndOverride: () => true } as never);

        await guard.canActivate({
            getHandler: () => undefined,
            getClass: () => undefined,
            switchToHttp: () => ({ getRequest: () => request }),
        } as never);

        expect(request.user.role).toBe('USER');
        expect(request.user.workspaceId).toBe(h.db.rows('user')[0].workspaceId);
    });
});
