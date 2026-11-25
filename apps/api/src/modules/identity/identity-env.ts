/**
 * Small environment helpers shared by the identity services (E01).
 * Pure: they only read what they are given.
 */

type ConfigReader = { get<T = string>(key: string): T | undefined };

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * The raw password-reset token is only returned in API responses when
 * IDENTITY_EXPOSE_DEV_TOKENS=true, and never in production. Without it the
 * token only travels by email.
 */
export function exposeDevTokens(config: ConfigReader): boolean {
    if (isProduction()) {
        return false;
    }

    const flag =
        config.get<string>('IDENTITY_EXPOSE_DEV_TOKENS') ??
        process.env.IDENTITY_EXPOSE_DEV_TOKENS;

    return flag === 'true';
}

/** Base URL used in emailed links. Null in production when it is not set. */
export function webAppUrl(config: ConfigReader): string | null {
    const configured =
        config.get<string>('WEB_APP_URL') ?? process.env.WEB_APP_URL;

    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    return isProduction() ? null : 'http://localhost:3000';
}
