import { createApp } from './app.js';
import { env as loadEnv } from './config/env.js';
import { systemClock, type AppContext } from './context.js';
import { createDb } from './db/client.js';
import { createLogger } from './lib/logger.js';
import { LogMailer, ResendMailer } from './services/mailer.js';
import { createStorage } from './services/storage.js';

async function main() {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
  const db = createDb(env.DATABASE_URL);
  const mailer = env.RESEND_API_KEY ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM) : new LogMailer(logger);
  if (!env.RESEND_API_KEY) logger.warn('RESEND_API_KEY not set — emails are written to the log instead of sent');
  const ctx: AppContext = { env, db, logger, clock: systemClock, mailer, storage: createStorage(env) };

  const app = createApp(ctx);
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'DueOra API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void db.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  process.stderr.write(`Failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
