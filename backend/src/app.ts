import { randomUUID } from 'node:crypto';

import cors from 'cors';
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import type { AppContext } from './context.js';
import { errorHandler, notFoundHandler } from './http/middleware/errorHandler.js';
import { healthRouter } from './routes/health.js';
import { apiRouter } from './routes/index.js';

export function createApp(ctx: AppContext): Express {
  const app = express();
  const { env } = ctx;

  app.disable('x-powered-by');
  // Behind Render/Railway's proxy: trust the first hop so rate limiting sees the real IP.
  app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);

  app.use(
    pinoHttp({
      logger: ctx.logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(cors({ origin: origins.length ? origins : true, maxAge: 600 }));
  app.use(express.json({ limit: '1mb' }));

  if (env.NODE_ENV !== 'test') {
    app.use(
      '/api',
      rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
    );
  }

  app.use(healthRouter(ctx));
  app.use('/api/v1', apiRouter(ctx));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
