import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { BASE_BACKOFF_MS, LOCK_TIMEOUT_MS, PermanentJobError, backoffMs, enqueue, pruneJobs, runDueJobs } from '../src/jobs/queue.js';

import { createTestContext } from './helpers/context.js';

const ctx = createTestContext();

beforeEach(async () => {
  await ctx.db.job.deleteMany();
  ctx.clock.set('2026-11-02T07:00:00Z');
});

afterAll(async () => {
  await ctx.db.$disconnect();
});

describe('job queue', () => {
  it('runs due jobs once and leaves future jobs alone', async () => {
    const seen: string[] = [];
    await enqueue(ctx, 'echo', { n: 1 });
    await enqueue(ctx, 'echo', { n: 2 }, { runAt: new Date('2026-11-02T08:00:00Z') });
    const stats = await runDueJobs(ctx, { echo: async (_c, p) => void seen.push(String(p.n)) });
    expect(stats).toEqual({ completed: 1, failed: 0, retried: 0 });
    expect(seen).toEqual(['1']);

    ctx.clock.set('2026-11-02T08:00:00Z');
    await runDueJobs(ctx, { echo: async (_c, p) => void seen.push(String(p.n)) });
    expect(seen).toEqual(['1', '2']);
    // Completed jobs never run again.
    await runDueJobs(ctx, { echo: async (_c, p) => void seen.push(String(p.n)) });
    expect(seen).toEqual(['1', '2']);
  });

  it('ignores a second job with the same singleton key', async () => {
    expect(await enqueue(ctx, 'tick', {}, { singletonKey: 'tick:07:00' })).not.toBeNull();
    expect(await enqueue(ctx, 'tick', {}, { singletonKey: 'tick:07:00' })).toBeNull();
    expect(await ctx.db.job.count()).toBe(1);
  });

  it('retries with exponential backoff and gives up after 5 attempts', async () => {
    let calls = 0;
    const flaky = {
      flaky: async () => {
        calls++;
        throw new Error('network down');
      },
    };
    const id = await enqueue(ctx, 'flaky', {});
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      await runDueJobs(ctx, flaky);
      const job = await ctx.db.job.findUniqueOrThrow({ where: { id: id! } });
      if (job.status === 'PENDING') {
        delays.push(job.runAt.getTime() - ctx.clock.now().getTime());
        ctx.clock.set(job.runAt);
      }
    }
    expect(calls).toBe(5);
    expect(delays).toEqual([1, 2, 4, 8].map((m) => m * BASE_BACKOFF_MS));
    const job = await ctx.db.job.findUniqueOrThrow({ where: { id: id! } });
    expect(job).toMatchObject({ status: 'FAILED', attempts: 5, lastError: 'network down' });
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
  });

  it('fails permanent errors immediately', async () => {
    const id = await enqueue(ctx, 'bad', {});
    const stats = await runDueJobs(ctx, { bad: async () => { throw new PermanentJobError('invalid address'); } });
    expect(stats.failed).toBe(1);
    expect((await ctx.db.job.findUniqueOrThrow({ where: { id: id! } })).attempts).toBe(1);
  });

  it('never runs one job twice when two workers race', async () => {
    let runs = 0;
    for (let i = 0; i < 30; i++) await enqueue(ctx, 'count', { i });
    const handlers = { count: async () => void runs++ };
    await Promise.all([runDueJobs(ctx, handlers, { workerId: 'a' }), runDueJobs(ctx, handlers, { workerId: 'b' })]);
    expect(runs).toBe(30);
    expect(await ctx.db.job.count({ where: { status: 'COMPLETED' } })).toBe(30);
  });

  it('recovers jobs abandoned by a crashed worker', async () => {
    const id = await enqueue(ctx, 'crash', {});
    await ctx.db.job.update({ where: { id: id! }, data: { status: 'RUNNING', lockedAt: ctx.clock.now(), attempts: 1 } });
    let ran = false;
    await runDueJobs(ctx, { crash: async () => void (ran = true) });
    expect(ran).toBe(false); // lock still fresh
    ctx.clock.advance(LOCK_TIMEOUT_MS + 1000);
    await runDueJobs(ctx, { crash: async () => void (ran = true) });
    expect(ran).toBe(true);
  });

  it('prunes old finished jobs', async () => {
    await enqueue(ctx, 'echo', {});
    await runDueJobs(ctx, { echo: async () => undefined });
    await ctx.db.job.updateMany({ data: { updatedAt: new Date('2026-10-01T00:00:00Z') } });
    expect(await pruneJobs(ctx, 14)).toBe(1);
  });
});
