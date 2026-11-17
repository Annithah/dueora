import type { ErrorEvent } from '@sentry/node';
import { describe, expect, it } from 'vitest';

import { initSentry, scrubEvent } from './sentry.js';

describe('sentry', () => {
  it('stays off without a DSN and in tests', () => {
    expect(initSentry({ NODE_ENV: 'production', SENTRY_DSN: undefined })).toBe(false);
    expect(initSentry({ NODE_ENV: 'test', SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1' })).toBe(false);
  });

  it('removes request bodies, headers, query strings, user and extras before sending', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://api.example/api/v1/bills',
        data: { accountReference: 'ACC-123' },
        headers: { authorization: 'Bearer x' },
        cookies: { s: '1' },
        query_string: 'q=ACC-123',
      },
      user: { email: 'someone@example.com' },
      extra: { accountReference: 'ACC-123' },
    } as ErrorEvent;
    const out = scrubEvent(event);
    expect(JSON.stringify(out)).not.toContain('ACC-123');
    expect(JSON.stringify(out)).not.toContain('Bearer');
    expect(out.user).toBeUndefined();
    expect(out.request?.url).toBe('https://api.example/api/v1/bills');
  });
});
