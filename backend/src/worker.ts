import { randomUUID } from 'node:crypto';

import { env as loadEnv } from './config/env.js';
import { systemClock, type AppContext } from './context.js';
import { createDb } from './db/client.js';
import { createLogger, type Logger } from './lib/logger.js';
import { ExpoPushProvider } from './notifications/push.js';
import { workOnce } from './notifications/scheduler.js';
import { LogMailer, ResendMailer } from './services/mailer.js';
import { createStorage } from './services/storage.js';

const POLL_MS = 5_000;

/**
 * Background worker loop: every few seconds, schedule the current 15-minute slot
 * (idempotent) and run due jobs. Safe to run more than one instance.
 */
export function startWorker(ctx: AppContext, logger: Logger): () => Promise<void> {
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  let stopped = false;
  let running: Promise<unknown> = Promise.resolve();

  const loop = async () => {
    while (!stopped) {
      running = workOnce(ctx, workerId).catch((err: unknown) => logger.error({ err }, 'Worker cycle failed'));
      await running;
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };
  logger.info({ workerId }, 'Notification worker started');
  void loop();

  return async () => {
    stopped = true;
    await running;
  };
}

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const db = createDb(env.DATABASE_URL);
  const mailer = env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new LogMailer(logger);
  const ctx: AppContext = {
    env,
    db,
    logger,
    clock: systemClock,
    mailer,
    storage: createStorage(env),
    push: new ExpoPushProvider(env.EXPO_ACCESS_TOKEN),
  };
  const stop = startWorker(ctx, logger);

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    await stop();
    await db.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only start when run directly (the API imports startWorker for RUN_WORKER_IN_API).
if (process.argv[1] && /worker\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err: unknown) => {
    process.stderr.write(`Worker failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
