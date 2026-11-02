import { pino, type Logger } from 'pino';

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: 'dueora-api' },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.passwordHash',
        '*.refreshToken',
        '*.token',
        '*.code',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  });
}

export type { Logger };
