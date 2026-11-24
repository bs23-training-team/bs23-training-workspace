/** The web app origin used when WEB_ORIGIN is not set (local development). */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

/**
 * Reads WEB_ORIGIN: one origin or a comma separated list, for example
 * "http://localhost:3000,https://staging.example.com". An origin has no path and no trailing slash.
 * "*" is refused on purpose. Not set or empty means the local web app only.
 */
export function parseWebOrigins(value: string | undefined): string[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  if (items.length === 0) return [DEFAULT_WEB_ORIGIN];

  return items.map((item) => {
    if (item === '*') throw new Error('WEB_ORIGIN must list the exact web origins; "*" is not allowed.');
    let origin: string | null = null;
    try {
      const url = new URL(item);
      if (url.protocol === 'http:' || url.protocol === 'https:') origin = url.origin;
    } catch {
      origin = null;
    }
    if (origin !== item) {
      throw new Error(`WEB_ORIGIN has an invalid origin "${item}". Use scheme, host and port only, for example http://localhost:3000.`);
    }
    return item;
  });
}

/**
 * CORS for the web app. The API reads the token from the Authorization header (Bearer), not from a cookie,
 * so credentials are not enabled.
 */
export function corsOptions(webOrigin: string | undefined) {
  return {
    origin: parseWebOrigins(webOrigin),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  };
}
