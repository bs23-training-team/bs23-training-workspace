/**
 * Startup checks for the JWT-related environment variables (E01).
 *
 * Pure function: it reads nothing itself and never returns secret VALUES,
 * only variable NAMES and rule descriptions. IdentityModule runs it when the
 * application boots, so a misconfigured server stops immediately instead of
 * failing at the first login.
 *
 * Rules:
 *   - JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set and different.
 *   - Each must be at least 32 characters. Shorter is an error in production
 *     and only a warning elsewhere, so existing development setups keep working.
 *   - WEB_APP_URL (used in the sign-in and password-reset email links) must be an http(s) URL. It is
 *     required in production; elsewhere a missing value only warns.
 */

export const MIN_JWT_SECRET_LENGTH = 32;

export type JwtConfigProblem = {
    level: 'error' | 'warning';
    message: string;
};

export type JwtConfigEnv = {
    JWT_ACCESS_SECRET?: string;
    JWT_REFRESH_SECRET?: string;
    WEB_APP_URL?: string;
    NODE_ENV?: string;
};

const isBlank = (value: string | undefined) =>
    typeof value !== 'string' || value.trim() === '';

export function checkJwtConfig(env: JwtConfigEnv): JwtConfigProblem[] {
    const production = env.NODE_ENV === 'production';
    const problems: JwtConfigProblem[] = [];

    const secrets = [
        ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
        ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
    ] as const;

    for (const [name, value] of secrets) {
        if (isBlank(value)) {
            problems.push({ level: 'error', message: `${name} is required.` });
        } else if (value!.length < MIN_JWT_SECRET_LENGTH) {
            problems.push({
                level: production ? 'error' : 'warning',
                message: `${name} must be at least ${MIN_JWT_SECRET_LENGTH} characters.`,
            });
        }
    }

    if (
        !isBlank(env.JWT_ACCESS_SECRET) &&
        env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET
    ) {
        problems.push({
            level: 'error',
            message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.',
        });
    }

    if (isBlank(env.WEB_APP_URL)) {
        problems.push({
            level: production ? 'error' : 'warning',
            message: 'WEB_APP_URL is required (it is used to build the sign-in and password-reset links).',
        });
    } else {
        let valid = false;
        let secure = false;
        try {
            const { protocol } = new URL(env.WEB_APP_URL!);
            valid = protocol === 'http:' || protocol === 'https:';
            secure = protocol === 'https:';
        } catch {
            valid = false;
        }
        if (!valid) {
            problems.push({
                level: production ? 'error' : 'warning',
                message: 'WEB_APP_URL must be an http(s) URL.',
            });
        } else if (production && !secure) {
            // SEC-10: password-reset links carry a secret
            // token, so in a deployed (production) environment they must
            // point at an https page. Plain http stays fine for local work.
            problems.push({
                level: 'error',
                message: 'WEB_APP_URL must use https in production (SEC-10).',
            });
        }
    }

    return problems;
}
