import type { AppContext } from '../context.js';
import { addDays, daysBetween, localTimeIn, paidForCycle, reminderSchedule, todayIn } from '../domain/schedule.js';

import { reminderCopy } from './messages.js';
import { dedupeKey, prefsFor, subscriptionUrl } from './store.js';

/**
 * Local backup reminders (master prompt 2.3). After every sync the app schedules on-device
 * notifications for the critical events of the next 14 days — the due date and the overdue
 * follow-ups — so they still appear if the phone was offline when the push went out.
 *
 * Each event carries the same key as the server notification (without the channel). Events
 * whose push was confirmed DELIVERED, or that are paid, muted or snoozed, are left out, and
 * the app replaces its whole local schedule with this list on every sync — which is how a
 * delivered push or a payment "cancels" the local copy.
 */
export interface BackupEvent {
  key: string;
  subscriptionId: string;
  type: 'DUE_TODAY' | 'OVERDUE';
  cycleDueDate: string;
  offsetDays: number;
  /** UTC instant to fire at (the workspace's reminder hour, after quiet hours). */
  fireAt: string;
  title: string;
  body: string;
  url: string;
}

/** The UTC instant at which the wall clock in `timeZone` reads `date` + `minutes` after midnight. */
export function zonedInstant(date: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = Date.UTC(y, m - 1, d, 0, minutes);
  let guess = target;
  // Two correction passes settle any UTC offset, DST included.
  for (let i = 0; i < 2; i++) {
    const local = localTimeIn(new Date(guess), timeZone);
    const [ly, lm, ld] = local.date.split('-').map(Number) as [number, number, number];
    const asUtc = Date.UTC(ly, lm - 1, ld, 0, local.minutes);
    guess += target - asUtc;
  }
  return new Date(guess);
}

export async function backupSchedule(ctx: AppContext, userId: string, workspaceId: string, days = 14): Promise<BackupEvent[]> {
  const ws = await ctx.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const today = todayIn(ctx.clock.now(), ws.timezone);
  const until = addDays(today, days);
  const prefs = await prefsFor(ctx, userId, workspaceId);
  if (!prefs.pushEnabled) return [];

  const subs = await ctx.db.subscription.findMany({
    where: { workspaceId, status: 'ACTIVE', nextDueDate: { lte: until } },
    include: { company: { select: { name: true } } },
  });
  if (subs.length === 0) return [];
  const [payments, snoozes, delivered] = await Promise.all([
    ctx.db.paymentRecord.findMany({
      where: { workspaceId, OR: subs.map((s) => ({ subscriptionId: s.id, cycleDueDate: s.nextDueDate })) },
      select: { subscriptionId: true, cycleDueDate: true, amountCents: true },
    }),
    ctx.db.reminderSnooze.findMany({ where: { userId, subscriptionId: { in: subs.map((s) => s.id) } } }),
    ctx.db.notification.findMany({
      where: { userId, workspaceId, channel: 'PUSH', status: 'DELIVERED', subscriptionId: { in: subs.map((s) => s.id) } },
      select: { dedupeKey: true },
    }),
  ]);
  const deliveredKeys = new Set(delivered.map((n) => n.dedupeKey.replace(/:PUSH$/, '')));

  // Fire at the reminder hour, or when quiet hours end if they cover it.
  let minutes = ws.reminderHour * 60;
  const { quietHoursStart: qs, quietHoursEnd: qe } = ws;
  if (qs !== null && qe !== null && qs !== qe) {
    const inside = qs < qe ? minutes >= qs && minutes < qe : minutes >= qs || minutes < qe;
    if (inside) minutes = qe;
  }
  const now = ctx.clock.now();

  const out: BackupEvent[] = [];
  for (const s of subs) {
    if (prefs.muted.has(s.id)) continue;
    const paid = paidForCycle(payments.filter((p) => p.subscriptionId === s.id), s.nextDueDate);
    const remaining = s.amountCents - paid;
    if (remaining <= 0) continue;
    const snooze = snoozes.find((z) => z.subscriptionId === s.id && z.cycleDueDate === s.nextDueDate);
    const offsets = (s.reminderOffsets as number[]).filter((o) => o <= 0);
    for (const r of reminderSchedule(s.nextDueDate, offsets, until)) {
      if (r.date < today || r.date > until) continue;
      if (snooze && r.date < snooze.snoozedUntil) continue;
      const fireAt = zonedInstant(r.date, minutes, ws.timezone);
      if (fireAt <= now) continue;
      const type = r.offsetDays === 0 ? 'DUE_TODAY' : 'OVERDUE';
      const key = dedupeKey([workspaceId, s.id, type, s.nextDueDate, r.offsetDays, userId]);
      if (deliveredKeys.has(key)) continue;
      const copy = reminderCopy({ name: s.name, company: s.company.name, amountCents: remaining, dueDate: s.nextDueDate, daysUntilDue: daysBetween(r.date, s.nextDueDate) });
      out.push({
        key,
        subscriptionId: s.id,
        type,
        cycleDueDate: s.nextDueDate,
        offsetDays: r.offsetDays,
        fireAt: fireAt.toISOString(),
        title: copy.title,
        body: copy.body,
        url: subscriptionUrl(ctx, s.id),
      });
    }
  }
  return out.sort((a, b) => a.fireAt.localeCompare(b.fireAt)).slice(0, 60);
}
