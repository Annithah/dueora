import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'file:./x.db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(env.STORAGE_DRIVER).toBe('local');
  });

  it('lists every problem', () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('requires https and complete S3 config in production', () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: 'production', API_BASE_URL: 'http://api.dueora.app', STORAGE_DRIVER: 's3' }),
    ).toThrow(/API_BASE_URL: must be https[\s\S]*S3_ENDPOINT/);
    expect(loadEnv({ ...base, NODE_ENV: 'production', API_BASE_URL: 'https://api.dueora.app' }).NODE_ENV).toBe(
      'production',
    );
  });

  it('parses booleans', () => {
    expect(loadEnv({ ...base, RUN_WORKER_IN_API: 'true' }).RUN_WORKER_IN_API).toBe(true);
    expect(loadEnv(base).RUN_WORKER_IN_API).toBe(false);
  });
});
