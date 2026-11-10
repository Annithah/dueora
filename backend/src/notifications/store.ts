import type { AppContext } from '../context.js';
import { localTimeIn, paidForCycle, todayIn } from '../domain/schedule.js';
import { Prisma, type NotificationChannel, type NotificationType } from '../generated/prisma/client.js';
import { enqueue } from '../jobs/queue.js';

export const QUEUES = {
  push: 'notify.push',
  email: 'notify.email',
} as const;

export interface NewNotification {
  workspaceId: string;
  userId: string;
  subscriptionId?: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data: Record<string, unknown>;
  cycleDueDate?: string | null;
  offsetDays?: number | null;
  dedupeKey: string;
}

export function dedupeKey(parts: (string | number | null | undefined)[]): string {
  return parts.map((p) => (p === null || p === undefined ? '-' : String(p))).join(':');
}

/**
 * When quiet hours apply right now, the instant they end; otherwise null.
 * Windows may wrap midnight (22:00 → 07:00).
 */
export function quietHoursEnd(now: Date, timeZone: string, start: number | null, end: number | null): Date | null {
  if (start === null || end === null || start === end) return null;
  const { minutes } = localTimeIn(now, timeZone);
  const inside = start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  if (!inside) return null;
  const minutesLeft = (end - minutes + 1440) % 1440;
  const seconds = now.getUTCSeconds() * 1000 + now.getUTCMilliseconds();
  return new Date(now.getTime() + minutesLeft * 60_000 - seconds);
}

/**
 * Insert-then-send: create the row (the unique dedupeKey makes this the moment of
 * truth) and only then enqueue delivery. Returns null when the notification already
 * exists — i.e. it was planned before and must not be sent again.
 */
export async function createNotification(
  ctx: AppContext,
  n: NewNotification,
  opts: { sendAfter?: Date | null } = {},
): Promise<{ id: string } | null> {
  const now = ctx.clock.now();
  const inApp = n.channel === 'IN_APP';
  try {
    const row = await ctx.db.notification.create({
      data: {
        ...n,
        subscriptionId: n.subscriptionId ?? null,
        cycleDueDate: n.cycleDueDate ?? null,
        offsetDays: n.offsetDays ?? null,
        data: n.data as Prisma.InputJsonValue,
        // In-app entries are "delivered" the moment they exist.
        status: inApp ? 'DELIVERED' : 'PENDING',
        sentAt: inApp ? now : null,
        sendAfter: inApp ? null : (opts.sendAfter ?? null),
        createdAt: now,
      },
      select: { id: true },
    });
    if (!inApp) {
      await enqueue(ctx, n.channel === 'PUSH' ? QUEUES.push : QUEUES.email, { notificationId: row.id }, { runAt: opts.sendAfter ?? now });
    }
    return row;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
}

export interface Prefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestEnabled: boolean;
  weeklySummary: boolean;
  monthlySummary: boolean;
  budgetAlerts: boolean;
  teamActivity: boolean;
  muted: Set<string>;
}

export const DEFAULT_PREFS: Omit<Prefs, 'muted'> = {
  pushEnabled: true,
  emailEnabled: true,
  inAppEnabled: true,
  digestEnabled: true,
  weeklySummary: true,
  monthlySummary: true,
  budgetAlerts: true,
  teamActivity: true,
};

export async function prefsFor(ctx: AppContext, userId: string, workspaceId: string): Promise<Prefs> {
  const p = await ctx.db.notificationPreference.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!p) return { ...DEFAULT_PREFS, muted: new Set() };
  return {
    pushEnabled: p.pushEnabled,
    emailEnabled: p.emailEnabled,
    inAppEnabled: p.inAppEnabled,
    digestEnabled: p.digestEnabled,
    weeklySummary: p.weeklySummary,
    monthlySummary: p.monthlySummary,
    budgetAlerts: p.budgetAlerts,
    teamActivity: p.teamActivity,
    muted: new Set(p.mutedSubscriptionIds as string[]),
  };
}

/** Snoozes for one user still in effect on `today`, keyed "subscriptionId:cycleDueDate". */
export async function activeSnoozes(ctx: AppContext, userId: string, today: string): Promise<Map<string, string>> {
  const rows = await ctx.db.reminderSnooze.findMany({ where: { userId, snoozedUntil: { gt: today } } });
  return new Map(rows.map((r) => [`${r.subscriptionId}:${r.cycleDueDate}`, r.snoozedUntil]));
}

/**
 * Is this reminder still worth sending? Checked right before delivery so paying,
 * archiving or muting stops messages already waiting (quiet hours, retries).
 * Returns a reason to cancel, or null to go ahead.
 */
export async function cancellationReason(
  ctx: AppContext,
  n: { userId: string; workspaceId: string; subscriptionId: string | null; cycleDueDate: string | null; type: NotificationType; data: unknown },
  prefs: Prefs,
): Promise<string | null> {
  const isReminder = n.type === 'REMINDER' || n.type === 'DUE_TODAY' || n.type === 'OVERDUE' || n.type === 'AUTO_RENEW_NOTICE';
  if (isReminder && n.subscriptionId && n.cycleDueDate) {
    const due = await subscriptionStillDue(ctx, n.subscriptionId, n.cycleDueDate, prefs);
    if (due) return due;
    if (n.type === 'AUTO_RENEW_NOTICE') {
      const s = await ctx.db.subscription.findUnique({ where: { id: n.subscriptionId }, select: { autoRenew: true } });
      if (!s?.autoRenew) return 'cancelled: auto-renew turned off';
    }
    return snoozedReason(ctx, n.userId, n.workspaceId, n.subscriptionId, n.cycleDueDate);
  }
  if (n.type === 'TRIAL_ENDING' && n.subscriptionId) {
    if (prefs.muted.has(n.subscriptionId)) return 'cancelled: muted';
    const s = await ctx.db.subscription.findUnique({ where: { id: n.subscriptionId }, select: { status: true, isTrial: true, trialEndsOn: true } });
    if (!s || s.status !== 'ACTIVE') return 'cancelled: not active';
    if (!s.isTrial || s.trialEndsOn !== n.cycleDueDate) return 'cancelled: trial changed';
    return null;
  }
  if (n.type === 'DIGEST') {
    const items = ((n.data as { items?: { subscriptionId: string; cycleDueDate: string }[] }).items ?? []);
    const reasons = await Promise.all(items.map((i) => subscriptionStillDue(ctx, i.subscriptionId, i.cycleDueDate, prefs)));
    return reasons.every((r) => r !== null) ? 'cancelled: nothing left to remind about' : null;
  }
  return null;
}

async function subscriptionStillDue(ctx: AppContext, subscriptionId: string, cycleDueDate: string, prefs: Prefs): Promise<string | null> {
  if (prefs.muted.has(subscriptionId)) return 'cancelled: muted';
  const o = await ctx.db.subscription.findUnique({ where: { id: subscriptionId }, select: { status: true, nextDueDate: true, amountCents: true } });
  if (!o) return 'cancelled: deleted';
  if (o.status !== 'ACTIVE') return `cancelled: ${o.status.toLowerCase()}`;
  if (o.nextDueDate !== cycleDueDate) return 'cancelled: paid';
  const payments = await ctx.db.paymentRecord.findMany({ where: { subscriptionId, cycleDueDate }, select: { cycleDueDate: true, amountCents: true } });
  if (paidForCycle(payments, cycleDueDate) >= o.amountCents) return 'cancelled: paid';
  return null;
}

/** Snoozed after the reminder was planned (e.g. it was waiting for quiet hours to end). */
async function snoozedReason(ctx: AppContext, userId: string, workspaceId: string, subscriptionId: string, cycleDueDate: string): Promise<string | null> {
  const z = await ctx.db.reminderSnooze.findUnique({ where: { userId_subscriptionId_cycleDueDate: { userId, subscriptionId, cycleDueDate } } });
  if (!z) return null;
  const ws = await ctx.db.workspace.findUnique({ where: { id: workspaceId }, select: { timezone: true } });
  return ws && z.snoozedUntil > todayIn(ctx.clock.now(), ws.timezone) ? 'cancelled: snoozed' : null;
}

export async function markCancelled(ctx: AppContext, id: string, reason: string): Promise<void> {
  await ctx.db.notification.update({ where: { id }, data: { status: 'FAILED', error: reason } });
}

export function subscriptionUrl(ctx: AppContext, subscriptionId: string): string {
  return `${ctx.env.APP_URL}subscriptions/${subscriptionId}`;
}
