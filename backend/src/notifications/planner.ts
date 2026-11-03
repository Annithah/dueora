import type { AppContext } from '../context.js';
import {
  addDays,
  daysBetween,
  localTimeIn,
  mostRecentMissedReminder,
  paidForCycle,
  type ReminderDate,
} from '../domain/schedule.js';
import { Prisma, type NotificationType } from '../generated/prisma/client.js';

import { digestCopy, subscriptionLabel, reminderCopy } from './messages.js';
import { createNotification, dedupeKey, subscriptionUrl, prefsFor, quietHoursEnd, type Prefs } from './store.js';

/** A user gets a digest instead of individual messages above this many reminders in one run. */
export const DIGEST_THRESHOLD = 3;

interface OrgForReminders {
  id: string;
  name: string;
  timezone: string;
  reminderHour: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export interface PlannedReminder {
  subscriptionId: string;
  cycleDueDate: string;
  offsetDays: number;
  type: NotificationType;
  title: string;
  body: string;
  /** Key moments also go by email: 7 days before, the due date, the first overdue reminder. */
  keyMoment: boolean;
  emailItem: {
    subscriptionId: string;
    cycleDueDate: string;
    label: string;
    company: string;
    provider: string | null;
    amountCents: number;
    dueDate: string;
    daysUntilDue: number;
    partiallyPaid: boolean;
    url: string;
  };
}

export interface RunResult {
  workspaceId: string;
  localDate: string;
  since: string;
  reminders: number;
  notifications: number;
}

/** Check every workspace; process those whose local reminder hour has arrived today. */
export async function runRemindersForAllOrgs(ctx: AppContext): Promise<RunResult[]> {
  const orgs = await ctx.db.workspace.findMany({
    select: { id: true, name: true, timezone: true, reminderHour: true, quietHoursStart: true, quietHoursEnd: true },
  });
  const results: RunResult[] = [];
  for (const org of orgs) {
    try {
      const r = await runRemindersForOrg(ctx, org);
      if (r) results.push(r);
    } catch (err) {
      // One workspace's problem must not stop everyone else's reminders.
      ctx.logger.error({ err, workspaceId: org.id }, 'Reminder run failed for workspace');
    }
  }
  return results;
}

/**
 * Plan and enqueue today's reminders for one workspace. Returns null when it's too
 * early locally or another worker already processed today.
 */
export async function runRemindersForOrg(ctx: AppContext, org: OrgForReminders): Promise<RunResult | null> {
  const now = ctx.clock.now();
  const local = localTimeIn(now, org.timezone);
  if (local.hour < org.reminderHour) return null;
  const today = local.date;

  // Claim the day — the unique (workspaceId, localDate) makes this atomic across workers.
  const previous = await ctx.db.workspaceReminderRun.findFirst({
    where: { workspaceId: org.id, localDate: { lt: today } },
    orderBy: { localDate: 'desc' },
  });
  try {
    await ctx.db.workspaceReminderRun.create({ data: { workspaceId: org.id, localDate: today, createdAt: now } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
    throw err;
  }
  // Catch-up window: everything since the last run (yesterday on a normal day).
  const since = previous?.localDate ?? addDays(today, -1);

  const subscriptions = await ctx.db.subscription.findMany({
    where: { workspaceId: org.id, status: 'ACTIVE' },
    include: { company: { select: { name: true } } },
  });
  const payments = subscriptions.length
    ? await ctx.db.paymentRecord.findMany({
        where: { workspaceId: org.id, OR: subscriptions.map((o) => ({ subscriptionId: o.id, cycleDueDate: o.nextDueDate })) },
        select: { subscriptionId: true, cycleDueDate: true, amountCents: true },
      })
    : [];
  const members = await ctx.db.membership.findMany({
    where: { workspaceId: org.id },
    select: { userId: true },
  });

  const perUser = new Map<string, PlannedReminder[]>();
  let reminderCount = 0;
  for (const o of subscriptions) {
    const offsets = o.reminderOffsets as number[];
    const paid = paidForCycle(payments.filter((p) => p.subscriptionId === o.id), o.nextDueDate);
    if (paid >= o.amountCents) continue;
    const r: ReminderDate | null = mostRecentMissedReminder(o.nextDueDate, offsets, since, today);
    if (!r) continue;
    reminderCount++;

    const days = daysBetween(today, o.nextDueDate);
    const remaining = o.amountCents - paid;
    const label = subscriptionLabel(o.name, o.company.name);
    const copy = reminderCopy({ name: o.name, company: o.company.name, amountCents: remaining, dueDate: o.nextDueDate, daysUntilDue: days });
    const firstOverdue = Math.max(...offsets.filter((x) => x < 0), -Infinity);
    const planned: PlannedReminder = {
      subscriptionId: o.id,
      cycleDueDate: o.nextDueDate,
      offsetDays: r.offsetDays,
      type: days > 0 ? 'REMINDER' : days === 0 ? 'DUE_TODAY' : 'OVERDUE',
      title: copy.title,
      body: copy.body,
      keyMoment: r.offsetDays === 7 || r.offsetDays === 0 || r.offsetDays === firstOverdue,
      emailItem: {
        subscriptionId: o.id,
        cycleDueDate: o.nextDueDate,
        label,
        company: o.company.name,
        provider: o.provider,
        amountCents: remaining,
        dueDate: o.nextDueDate,
        daysUntilDue: days,
        partiallyPaid: paid > 0,
        url: subscriptionUrl(ctx, o.id),
      },
    };

    for (const userId of recipientsFor(members)) {
      perUser.set(userId, [...(perUser.get(userId) ?? []), planned]);
    }
  }

  const sendAfter = quietHoursEnd(now, org.timezone, org.quietHoursStart, org.quietHoursEnd);
  let created = 0;
  for (const [userId, items] of perUser) {
    created += await deliverToUser(ctx, org, userId, items, today, sendAfter);
  }
  ctx.logger.info({ workspaceId: org.id, today, since, reminders: reminderCount, notifications: created }, 'Reminders planned');
  return { workspaceId: org.id, localDate: today, since, reminders: reminderCount, notifications: created };
}

/**
 * Every workspace member (ADMIN, FINANCE and VIEWER) receives reminders. Users who muted
 * the subscription or turned a channel off are filtered later, per user (deliverToUser).
 */
export function recipientsFor(members: { userId: string }[]): string[] {
  return [...new Set(members.map((m) => m.userId))];
}

async function deliverToUser(
  ctx: AppContext,
  org: OrgForReminders,
  userId: string,
  all: PlannedReminder[],
  today: string,
  sendAfter: Date | null,
): Promise<number> {
  const prefs: Prefs = await prefsFor(ctx, userId, org.id);
  const items = all.filter((i) => !prefs.muted.has(i.subscriptionId));
  if (items.length === 0) return 0;
  const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
  const canPush = prefs.pushEnabled && hasDevice;
  let created = 0;

  const key = (i: PlannedReminder, channel: string) => dedupeKey([org.id, i.subscriptionId, i.cycleDueDate, i.offsetDays, userId, channel]);
  const base = (i: PlannedReminder) => ({
    workspaceId: org.id,
    userId,
    subscriptionId: i.subscriptionId,
    type: i.type,
    title: i.title,
    body: i.body,
    cycleDueDate: i.cycleDueDate,
    offsetDays: i.offsetDays,
    data: { ...i.emailItem },
  });

  // In-app: always, one per reminder (makes no noise, so ignores quiet hours).
  for (const i of items) {
    if (await createNotification(ctx, { ...base(i), channel: 'IN_APP', dedupeKey: key(i, 'IN_APP') })) created++;
  }

  if (prefs.digestEnabled && items.length > DIGEST_THRESHOLD) {
    const copy = digestCopy(items.length, items.map((i) => i.emailItem.label));
    const digest = {
      workspaceId: org.id,
      userId,
      type: 'DIGEST' as const,
      title: copy.title,
      body: copy.body,
      data: { url: `${ctx.env.APP_URL}alerts`, items: items.map((i) => i.emailItem) },
    };
    if (canPush && (await createNotification(ctx, { ...digest, channel: 'PUSH', dedupeKey: dedupeKey([org.id, 'digest', today, userId, 'PUSH']) }, { sendAfter }))) created++;
    if (prefs.emailEnabled && (await createNotification(ctx, { ...digest, channel: 'EMAIL', dedupeKey: dedupeKey([org.id, 'digest', today, userId, 'EMAIL']) }, { sendAfter }))) created++;
    return created;
  }

  for (const i of items) {
    if (canPush && (await createNotification(ctx, { ...base(i), channel: 'PUSH', dedupeKey: key(i, 'PUSH') }, { sendAfter }))) created++;
    const wantsEmail = prefs.emailEnabled && (!canPush || i.keyMoment);
    if (wantsEmail && (await createNotification(ctx, { ...base(i), channel: 'EMAIL', dedupeKey: key(i, 'EMAIL') }, { sendAfter }))) created++;
  }
  return created;
}
