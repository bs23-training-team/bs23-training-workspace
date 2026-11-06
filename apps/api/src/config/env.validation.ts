// Fails fast at startup when a required environment variable is missing,
// instead of failing later with a confusing database error.
const REQUIRED = ['DATABASE_URL'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => {
    const value = config[key];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'For local development copy apps/api/.env.example to apps/api/.env.',
    );
  }

  return config;
}
