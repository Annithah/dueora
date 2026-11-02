import type { AppContext } from '../context.js';
import { pruneJobs, runDueJobs, type JobHandler, type WorkerStats } from '../jobs/queue.js';

import { checkReceipts, deliverEmail, deliverPush } from './delivery.js';
import { runRemindersForAllOrgs } from './planner.js';
import { QUEUES } from './store.js';

export const SLOT_MINUTES = 15;

/** All background job handlers. */
export const handlers: Record<string, JobHandler> = {
  [QUEUES.push]: deliverPush,
  [QUEUES.email]: deliverEmail,
};

/** "2026-11-02T07:15" — the 15-minute slot an instant falls in. */
export function slotOf(now: Date): string {
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / SLOT_MINUTES) * SLOT_MINUTES);
  return d.toISOString().slice(0, 16);
}

/** Last 15-minute slot each worker context ran its housekeeping in. */
const lastSlot = new WeakMap<AppContext, string>();

/**
 * Once per 15-minute slot per worker: check push receipts and prune old jobs.
 * Both are idempotent, so overlapping workers are harmless.
 */
export async function schedulerTick(ctx: AppContext): Promise<void> {
  const slot = slotOf(ctx.clock.now());
  if (lastSlot.get(ctx) === slot) return;
  lastSlot.set(ctx, slot);
  await checkReceipts(ctx, {}, { id: `receipts:${slot}`, attempts: 1 });
  if (slot.endsWith('T00:00')) await pruneJobs(ctx);
}

/**
 * One worker cycle: plan reminders for every workspace whose reminder hour has come
 * (each workspace-day is claimed atomically, so this is exactly-once no matter how
 * many workers call it), run this slot's housekeeping, then run due delivery jobs.
 */
export async function workOnce(ctx: AppContext, workerId?: string): Promise<WorkerStats> {
  await runRemindersForAllOrgs(ctx);
  await schedulerTick(ctx);
  return runDueJobs(ctx, handlers, { workerId });
}
