import type { Env } from './config/env.js';
import type { Db } from './db/client.js';
import type { Logger } from './lib/logger.js';
import type { PushProvider } from './notifications/push.js';
import type { Mailer } from './services/mailer.js';
import type { Storage } from './services/storage.js';

/** Source of "now". Injected so tests (e.g. the year-long reminder simulation) can fake time. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Everything a request handler or job needs. Built once at startup; tests build their own. */
export interface AppContext {
  env: Env;
  db: Db;
  logger: Logger;
  clock: Clock;
  mailer: Mailer;
  storage: Storage;
  push: PushProvider;
}
