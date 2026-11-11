import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

const base = {
  DATABASE_URL: 'file:./x.db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
  ACCOUNT_REF_SECRET: 'k'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    const env = loadEnv(base);
    expect(env.PORT).toBe(4000);
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
  });

  it('lists every problem', () => {
    expect(() => loadEnv({ JWT_ACCESS_SECRET: 'short' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*ACCOUNT_REF_SECRET/,
    );
  });

  it('requires a long account reference secret', () => {
    expect(() => loadEnv({ ...base, ACCOUNT_REF_SECRET: 'too-short' })).toThrow(/ACCOUNT_REF_SECRET/);
  });

  it('requires https in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', API_BASE_URL: 'http://api.dueora.app' })).toThrow(
      /API_BASE_URL: must be https/,
    );
    expect(loadEnv({ ...base, NODE_ENV: 'production', API_BASE_URL: 'https://api.dueora.app' }).NODE_ENV).toBe(
      'production',
    );
  });
});
