import { describe, expect, it } from 'vitest';
import { API_VERSION, APP_NAME } from './meta.js';

describe('meta', () => {
  it('exposes the app name and API version', () => {
    expect(APP_NAME).toBe('DueOra');
    expect(API_VERSION).toBe('v1');
  });
});
