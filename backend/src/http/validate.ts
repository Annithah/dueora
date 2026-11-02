import type { Request } from 'express';
import type { z } from 'zod';

/** Parse request parts with zod; a ZodError becomes a 400 in the error handler. */
export function parseBody<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  return schema.parse(req.body ?? {});
}

export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  return schema.parse(req.query);
}

export function parseParams<S extends z.ZodType>(req: Request, schema: S): z.infer<S> {
  return schema.parse(req.params);
}
