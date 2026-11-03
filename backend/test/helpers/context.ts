import { randomUUID } from 'node:crypto';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

import { loadEnv } from '../../src/config/env.js';
import { testDbDir } from '../globalSetup.js';
import type { AppContext, Clock } from '../../src/context.js';
import { createDb } from '../../src/db/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { createSecretBox } from '../../src/lib/secretBox.js';
import { FakePushProvider } from '../../src/notifications/push.js';
import { MemoryMailer } from '../../src/services/mailer.js';

/** A clock tests can move: `clock.set('2026-11-02T07:00:00Z')`, `clock.advance(ms)`. */
export class FakeClock implements Clock {
  private current: Date;
  constructor(start: string | Date = '2026-11-02T07:00:00.000Z') {
    this.current = new Date(start);
  }
  now(): Date {
    return new Date(this.current);
  }
  set(value: string | Date): void {
    this.current = new Date(value);
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export type TestContext = AppContext & { clock: FakeClock; mailer: MemoryMailer; push: FakePushProvider };

/** Fresh, migrated SQLite database + context for one test file. */
export function createTestContext(
  overrides: Partial<Omit<AppContext, 'clock'>> = {},
  envOverrides: Record<string, string> = {},
): TestContext {
  const template = path.join(testDbDir(), 'template.db');
  const file = path.join(testDbDir(), `${randomUUID()}.db`);
  copyFileSync(template, file);
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: `file:${file.split(path.sep).join('/')}`,
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
    SUBSCRIPTION_KEY_SECRET: 'test-subscription-key-secret-0123456789abcdef',
    LOG_LEVEL: 'silent',
    ...envOverrides,
  });
  return {
    env,
    db: createDb(env.DATABASE_URL),
    logger: createLogger('silent'),
    keys: createSecretBox('test-subscription-key-secret-0123456789abcdef'),
    ...overrides,
    clock: new FakeClock(),
    mailer: new MemoryMailer(),
    push: new FakePushProvider(),
  };
}
