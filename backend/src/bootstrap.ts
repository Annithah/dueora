import { createModel } from './ai/model.js';
import type { Env } from './config/env.js';
import { systemClock, type AppContext } from './context.js';
import { createDb } from './db/client.js';
import { createLogger } from './lib/logger.js';
import { createSecretBox } from './lib/secretBox.js';
import { ExpoPushProvider } from './notifications/push.js';
import { LogMailer, ResendMailer } from './services/mailer.js';

/** Production context shared by the API server and the worker process. */
export function createContext(env: Env): AppContext {
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  if (!env.RESEND_API_KEY) logger.warn('RESEND_API_KEY not set — emails are written to the log instead of sent');
  return {
    env,
    logger,
    db: createDb(env.DATABASE_URL),
    clock: systemClock,
    mailer: env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new LogMailer(logger),
    push: new ExpoPushProvider(env.EXPO_ACCESS_TOKEN),
    keys: createSecretBox(env.SUBSCRIPTION_KEY_SECRET),
    ai: createModel(env),
  };
}
