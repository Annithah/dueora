import * as Sentry from '@sentry/node';
import type { ErrorEvent } from '@sentry/node';

import type { Env } from '../config/env.js';

let enabled = false;

/** Strips everything that could hold user data: bodies, headers, cookies, query strings and extras. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
  }
  delete event.user;
  delete event.extra;
  return event;
}

/** Turns Sentry on only when SENTRY_DSN is set. Returns whether it is on. */
export function initSentry(env: Pick<Env, 'SENTRY_DSN' | 'NODE_ENV'>, release?: string): boolean {
  if (!env.SENTRY_DSN || env.NODE_ENV === 'test') return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
  enabled = true;
  return true;
}

export function captureError(err: unknown, requestId?: string): void {
  if (!enabled) return;
  Sentry.captureException(err, requestId ? { tags: { requestId } } : undefined);
}
