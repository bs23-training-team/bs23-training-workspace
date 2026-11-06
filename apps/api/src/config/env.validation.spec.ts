import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  it('accepts a config with DATABASE_URL', () => {
    const config = { DATABASE_URL: 'postgresql://u:p@localhost:5433/db' };
    expect(validateEnv(config)).toBe(config);
  });

  it('rejects a missing or empty DATABASE_URL with a helpful message', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: '  ' })).toThrow(/\.env\.example/);
  });
});
