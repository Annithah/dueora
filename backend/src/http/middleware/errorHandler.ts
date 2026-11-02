import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../errors.js';

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown; requestId?: string };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  } satisfies ErrorBody);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id ?? '');

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    } satisfies ErrorBody);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        requestId,
      },
    } satisfies ErrorBody);
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'That already exists', requestId },
      } satisfies ErrorBody);
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Resource not found', requestId },
      } satisfies ErrorBody);
      return;
    }
  }

  // Malformed JSON bodies from express.json().
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Malformed JSON body', requestId },
    } satisfies ErrorBody);
    return;
  }

  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) req.log?.error({ err }, 'Unhandled error');
  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
      message: status === 500 ? 'Something went wrong on our side' : String(err.message ?? 'Bad request'),
      requestId,
    },
  } satisfies ErrorBody);
};
