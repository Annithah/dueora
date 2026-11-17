import { createApp } from './app.js';
import { env as loadEnv } from './config/env.js';
import { createContext } from './bootstrap.js';
import { initSentry } from './lib/sentry.js';
import { startWorker } from './worker.js';

async function main() {
  const env = loadEnv();
  const ctx = createContext(env);
  const { logger, db } = ctx;
  if (initSentry(env, process.env.npm_package_version)) logger.info('Sentry error reporting on');

  const app = createApp(ctx);
  const stopWorker = env.RUN_WORKER_IN_API ? startWorker(ctx, logger) : null;
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'DueOra API listening');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void (stopWorker?.() ?? Promise.resolve())
        .then(() => db.$disconnect())
        .finally(() => process.exit(0));
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
