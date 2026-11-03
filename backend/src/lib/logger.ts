import { pino, type DestinationStream, type Logger } from 'pino';

/** `destination` lets tests capture log output (e.g. to prove secrets never reach it). */
export function createLogger(level: string, pretty = false, destination?: DestinationStream): Logger {
  const options = {
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
        'subscriptionKey',
        '*.subscriptionKey',
        '*.*.subscriptionKey',
        'req.body',
      ],
      censor: '[redacted]',
    },
    ...(pretty && !destination ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } } : {}),
  };
  return destination ? pino(options, destination) : pino(options);
}

export type { Logger };
