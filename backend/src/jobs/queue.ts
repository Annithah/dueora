import { randomUUID } from 'node:crypto';

import type { AppContext } from '../context.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Database-backed job queue (DECISIONS.md D2). Works on SQLite and Postgres:
 * - claim: conditional update PENDING → RUNNING, so two workers never run one job
 * - retries: exponential backoff (30 s × 2^attempt), max `maxAttempts` (default 5)
 * - crash recovery: RUNNING jobs whose lock is older than LOCK_TIMEOUT go back to PENDING
 * - idempotent enqueue: a second job with the same `singletonKey` is ignored
 */

export const LOCK_TIMEOUT_MS = 10 * 60_000;
export const BASE_BACKOFF_MS = 30_000;

export type JobPayload = Record<string, unknown>;
export type JobHandler = (ctx: AppContext, payload: JobPayload, job: { id: string; attempts: number }) => Promise<void>;

/** Thrown by a handler to fail a job permanently (no retries). */
export class PermanentJobError extends Error {}

export interface EnqueueOptions {
  runAt?: Date;
  singletonKey?: string;
  maxAttempts?: number;
}

/** Returns the new job id, or null when a job with the same singletonKey already exists. */
export async function enqueue(ctx: AppContext, queue: string, payload: JobPayload, opts: EnqueueOptions = {}): Promise<string | null> {
  try {
    const job = await ctx.db.job.create({
      data: {
        queue,
        payload: payload as Prisma.InputJsonValue,
        runAt: opts.runAt ?? ctx.clock.now(),
        singletonKey: opts.singletonKey ?? null,
        maxAttempts: opts.maxAttempts ?? 5,
        createdAt: ctx.clock.now(),
      },
    });
    return job.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export function backoffMs(attempts: number): number {
  return BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);
}

export interface WorkerStats {
  completed: number;
  failed: number;
  retried: number;
}

/**
 * Run due jobs until none are left (or `limit` is reached). Safe to call from several
 * processes at once. Returns what happened, for logs and tests.
 */
export async function runDueJobs(
  ctx: AppContext,
  handlers: Record<string, JobHandler>,
  opts: { limit?: number; workerId?: string } = {},
): Promise<WorkerStats> {
  const workerId = opts.workerId ?? randomUUID();
  const limit = opts.limit ?? 500;
  const stats: WorkerStats = { completed: 0, failed: 0, retried: 0 };
  const queues = Object.keys(handlers);

  await releaseStaleLocks(ctx);

  let processed = 0;
  while (processed < limit) {
    const now = ctx.clock.now();
    const candidates = await ctx.db.job.findMany({
      where: { status: 'PENDING', runAt: { lte: now }, queue: { in: queues } },
      orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
      take: 20,
      select: { id: true },
    });
    if (candidates.length === 0) break;

    for (const { id } of candidates) {
      if (processed >= limit) break;
      const claimed = await ctx.db.job.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'RUNNING', lockedAt: ctx.clock.now(), lockedBy: workerId, attempts: { increment: 1 } },
      });
      if (claimed.count === 0) continue; // another worker got it
      processed++;
      await runOne(ctx, handlers, id, stats);
    }
  }
  return stats;
}

async function runOne(ctx: AppContext, handlers: Record<string, JobHandler>, id: string, stats: WorkerStats) {
  const job = await ctx.db.job.findUniqueOrThrow({ where: { id } });
  const handler = handlers[job.queue]!;
  try {
    await handler(ctx, job.payload as JobPayload, { id: job.id, attempts: job.attempts });
    await ctx.db.job.update({ where: { id }, data: { status: 'COMPLETED', lockedAt: null, lastError: null } });
    stats.completed++;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const permanent = err instanceof PermanentJobError || job.attempts >= job.maxAttempts;
    if (permanent) {
      await ctx.db.job.update({ where: { id }, data: { status: 'FAILED', lockedAt: null, lastError: message.slice(0, 1000) } });
      stats.failed++;
      ctx.logger.error({ jobId: id, queue: job.queue, attempts: job.attempts, err: message }, 'Job failed permanently');
    } else {
      await ctx.db.job.update({
        where: { id },
        data: {
          status: 'PENDING',
          lockedAt: null,
          lockedBy: null,
          lastError: message.slice(0, 1000),
          runAt: new Date(ctx.clock.now().getTime() + backoffMs(job.attempts)),
        },
      });
      stats.retried++;
      ctx.logger.warn({ jobId: id, queue: job.queue, attempts: job.attempts, err: message }, 'Job failed, will retry');
    }
  }
}

/** Put jobs abandoned by a crashed worker back in the queue. */
export async function releaseStaleLocks(ctx: AppContext): Promise<number> {
  const res = await ctx.db.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(ctx.clock.now().getTime() - LOCK_TIMEOUT_MS) } },
    data: { status: 'PENDING', lockedAt: null, lockedBy: null },
  });
  return res.count;
}

/** Delete finished jobs older than `days` so the table stays small. */
export async function pruneJobs(ctx: AppContext, days = 14): Promise<number> {
  const res = await ctx.db.job.deleteMany({
    where: { status: { in: ['COMPLETED', 'FAILED'] }, updatedAt: { lt: new Date(ctx.clock.now().getTime() - days * 86_400_000) } },
  });
  return res.count;
}
