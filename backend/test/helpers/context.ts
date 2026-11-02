import { randomUUID } from 'node:crypto';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

import { loadEnv } from '../../src/config/env.js';
import type { AppContext, Clock } from '../../src/context.js';
import { createDb } from '../../src/db/client.js';
import { createLogger } from '../../src/lib/logger.js';
import { MemoryMailer } from '../../src/services/mailer.js';
import { MemoryStorage } from '../../src/services/storage.js';

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

export type TestContext = AppContext & { clock: FakeClock; mailer: MemoryMailer; storage: MemoryStorage };

/** Fresh, migrated SQLite database + context for one test file. */
export function createTestContext(overrides: Partial<Omit<AppContext, 'clock'>> = {}): TestContext {
  const template = path.resolve('test/.tmp/template.db');
  const file = path.resolve(`test/.tmp/${randomUUID()}.db`);
  copyFileSync(template, file);
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: `file:${file.split(path.sep).join('/')}`,
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
    LOG_LEVEL: 'silent',
  });
  return {
    env,
    db: createDb(env.DATABASE_URL),
    logger: createLogger('silent'),
    ...overrides,
    clock: new FakeClock(),
    mailer: new MemoryMailer(),
    storage: new MemoryStorage(),
  };
}
