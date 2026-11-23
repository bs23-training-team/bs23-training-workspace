import { checkJwtConfig, MIN_JWT_SECRET_LENGTH } from './jwt-config.js';

const a = 'a'.repeat(MIN_JWT_SECRET_LENGTH);
const b = 'b'.repeat(MIN_JWT_SECRET_LENGTH);
const good = {
    JWT_ACCESS_SECRET: a,
    JWT_REFRESH_SECRET: b,
    WEB_APP_URL: 'https://app.example.com',
    NODE_ENV: 'production',
};

const errors = (env: Parameters<typeof checkJwtConfig>[0]) =>
    checkJwtConfig(env).filter((p) => p.level === 'error');

describe('checkJwtConfig', () => {
    it('accepts a valid production configuration', () => {
        expect(checkJwtConfig(good)).toEqual([]);
    });

    it('requires both secrets in every environment', () => {
        const env = { ...good, NODE_ENV: 'development', JWT_ACCESS_SECRET: '', JWT_REFRESH_SECRET: undefined };
        const messages = errors(env).map((p) => p.message);
        expect(messages).toContain('JWT_ACCESS_SECRET is required.');
        expect(messages).toContain('JWT_REFRESH_SECRET is required.');
    });

    it('rejects identical secrets', () => {
        expect(errors({ ...good, JWT_REFRESH_SECRET: a }).map((p) => p.message)).toContain(
            'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.',
        );
    });

    it('treats short secrets as an error in production but a warning elsewhere', () => {
        const short = { ...good, JWT_ACCESS_SECRET: 'short' };
        expect(errors(short)).toHaveLength(1);
        const dev = checkJwtConfig({ ...short, NODE_ENV: 'development' });
        expect(dev.filter((p) => p.level === 'error')).toEqual([]);
        expect(dev.some((p) => p.level === 'warning')).toBe(true);
    });

    it('requires an http(s) WEB_APP_URL in production', () => {
        expect(errors({ ...good, WEB_APP_URL: undefined })).toHaveLength(1);
        expect(errors({ ...good, WEB_APP_URL: 'not a url' })).toHaveLength(1);
        expect(errors({ ...good, WEB_APP_URL: 'ftp://host' })).toHaveLength(1);
    });

    it('requires https for WEB_APP_URL in production only (SEC-10)', () => {
        const http = { ...good, WEB_APP_URL: 'http://app.example.com' };
        expect(errors(http).map((p) => p.message)).toContain(
            'WEB_APP_URL must use https in production (SEC-10).',
        );
        // Local development keeps working over http.
        expect(errors({ ...http, NODE_ENV: 'development' })).toEqual([]);
        expect(
            errors({ ...good, WEB_APP_URL: 'http://localhost:3000', NODE_ENV: 'development' }),
        ).toEqual([]);
    });

    it('never puts a secret value in a message', () => {
        const text = JSON.stringify(checkJwtConfig({ ...good, JWT_ACCESS_SECRET: 'super-secret-value', JWT_REFRESH_SECRET: 'super-secret-value' }));
        expect(text).not.toContain('super-secret-value');
    });
});
