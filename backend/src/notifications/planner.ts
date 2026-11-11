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

import { checkBudgetAlerts } from '../modules/budgets/service.js';

import { autoRenewCopy, digestCopy, billLabel, reminderCopy, trialEndingCopy } from './messages.js';
import { createNotification, dedupeKey, billUrl, prefsFor, quietHoursEnd, type Prefs } from './store.js';
import { runSummaries } from './summaries.js';

/** TRIAL_ENDING goes out this many days before the trial ends. */
export const TRIAL_OFFSETS = [3, 1] as const;
/** AUTO_RENEW_NOTICE goes out this many days before an automatic renewal charge. */
export const AUTO_RENEW_OFFSETS = [7] as const;

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
  billId: string;
  cycleDueDate: string;
  offsetDays: number;
  type: NotificationType;
  title: string;
  body: string;
  /** Key moments also go by email: 7 days before, the due date, the first overdue reminder. */
  keyMoment: boolean;
  /** Who gets it: every member, ADMIN/FINANCE only, or one user (the end of their snooze). */
  audience: 'all' | 'managers' | { userId: string };
  emailItem: {
    billId: string;
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

  const bills = await ctx.db.bill.findMany({
    where: { workspaceId: org.id, status: 'ACTIVE' },
    include: { company: { select: { name: true } } },
  });
  const payments = bills.length
    ? await ctx.db.paymentRecord.findMany({
        where: { workspaceId: org.id, OR: bills.map((o) => ({ billId: o.id, cycleDueDate: o.nextDueDate })) },
        select: { billId: true, cycleDueDate: true, amountCents: true },
      })
    : [];
  const members = await ctx.db.membership.findMany({
    where: { workspaceId: org.id },
    select: { userId: true, role: true },
  });
  const everyone = recipientsFor(members);
  const managers = new Set(members.filter((m) => m.role !== 'VIEWER').map((m) => m.userId));
  const snoozes = bills.length
    ? await ctx.db.reminderSnooze.findMany({ where: { billId: { in: bills.map((s) => s.id) } } })
    : [];
  const snoozeOf = (userId: string, billId: string, cycle: string) =>
    snoozes.find((z) => z.userId === userId && z.billId === billId && z.cycleDueDate === cycle);

  const planned: PlannedReminder[] = [];
  for (const o of bills) {
    const offsets = o.reminderOffsets as number[];
    const paid = paidForCycle(payments.filter((p) => p.billId === o.id), o.nextDueDate);
    const remaining = o.amountCents - paid;
    const label = billLabel(o.name, o.company.name);
    const days = daysBetween(today, o.nextDueDate);
    const emailItem = {
      billId: o.id,
      cycleDueDate: o.nextDueDate,
      label,
      company: o.company.name,
      provider: o.provider,
      amountCents: Math.max(0, remaining),
      dueDate: o.nextDueDate,
      daysUntilDue: days,
      partiallyPaid: paid > 0,
      url: billUrl(ctx, o.id),
    };
    const dueReminder = (offsetDays: number, keyMoment: boolean, audience: PlannedReminder['audience']): PlannedReminder => {
      const copy = reminderCopy({ name: o.name, company: o.company.name, amountCents: remaining, dueDate: o.nextDueDate, daysUntilDue: days });
      return {
        billId: o.id,
        cycleDueDate: o.nextDueDate,
        offsetDays,
        type: days > 0 ? 'REMINDER' : days === 0 ? 'DUE_TODAY' : 'OVERDUE',
        title: copy.title,
        body: copy.body,
        keyMoment,
        audience,
        emailItem,
      };
    };

    // Free trial ending (independent of payment: the trial is the event).
    if (o.isTrial && o.trialEndsOn && o.trialEndsOn >= today) {
      const t = mostRecentMissedReminder(o.trialEndsOn, TRIAL_OFFSETS, since, today);
      if (t) {
        const copy = trialEndingCopy({ name: o.name, daysLeft: daysBetween(today, o.trialEndsOn) });
        planned.push({
          billId: o.id,
          cycleDueDate: o.trialEndsOn,
          offsetDays: t.offsetDays,
          type: 'TRIAL_ENDING',
          title: copy.title,
          body: copy.body,
          keyMoment: true,
          audience: 'all',
          emailItem: { ...emailItem, dueDate: o.trialEndsOn, daysUntilDue: daysBetween(today, o.trialEndsOn) },
        });
      }
    }

    if (remaining <= 0) continue;

    // Heads-up before an automatic renewal charges the card.
    if (o.autoRenew) {
      const a = mostRecentMissedReminder(o.nextDueDate, AUTO_RENEW_OFFSETS, since, today);
      if (a && days > 0) {
        const copy = autoRenewCopy({ label, dueDate: o.nextDueDate, amountCents: remaining });
        planned.push({
          billId: o.id,
          cycleDueDate: o.nextDueDate,
          offsetDays: a.offsetDays,
          type: 'AUTO_RENEW_NOTICE',
          title: copy.title,
          body: copy.body,
          keyMoment: false,
          audience: 'managers',
          emailItem,
        });
      }
    }

    const r: ReminderDate | null = mostRecentMissedReminder(o.nextDueDate, offsets, since, today);
    const firstOverdue = Math.max(...offsets.filter((x) => x < 0), -Infinity);
    if (r) planned.push(dueReminder(r.offsetDays, r.offsetDays === 7 || r.offsetDays === 0 || r.offsetDays === firstOverdue, 'all'));

    // A snooze that ended since the last run brings back one reminder for that user —
    // unless a scheduled one goes out today anyway.
    for (const z of snoozes) {
      if (z.billId !== o.id || z.cycleDueDate !== o.nextDueDate) continue;
      if (z.snoozedUntil > since && z.snoozedUntil <= today && !r) planned.push(dueReminder(days, false, { userId: z.userId }));
    }
  }

  const perUser = new Map<string, PlannedReminder[]>();
  for (const p of planned) {
    const targets =
      typeof p.audience === 'object' ? [p.audience.userId] : p.audience === 'managers' ? everyone.filter((u) => managers.has(u)) : everyone;
    for (const userId of targets) {
      if (!everyone.includes(userId)) continue;
      // Snoozed: nothing about this cycle until the snooze ends (trial notices still come).
      const z = p.type !== 'TRIAL_ENDING' ? snoozeOf(userId, p.billId, p.cycleDueDate) : undefined;
      if (z && z.snoozedUntil > today) continue;
      perUser.set(userId, [...(perUser.get(userId) ?? []), p]);
    }
  }
  const reminderCount = planned.length;

  const sendAfter = quietHoursEnd(now, org.timezone, org.quietHoursStart, org.quietHoursEnd);
  let created = 0;
  for (const [userId, items] of perUser) {
    created += await deliverToUser(ctx, org, userId, items, today, sendAfter);
  }
  // Weekly digest (Mondays), monthly summary (the 1st) and budget alerts ride on the same daily run.
  try {
    created += await runSummaries(ctx, org, { since, today, sendAfter, members: everyone });
    created += await checkBudgetAlerts(ctx, org.id, today);
  } catch (err) {
    ctx.logger.error({ err, workspaceId: org.id }, 'Summaries or budget check failed');
  }
  ctx.logger.info({ workspaceId: org.id, today, since, reminders: reminderCount, notifications: created }, 'Reminders planned');
  return { workspaceId: org.id, localDate: today, since, reminders: reminderCount, notifications: created };
}

/**
 * Every workspace member (ADMIN, FINANCE and VIEWER) receives reminders. Users who muted
 * the bill or turned a channel off are filtered later, per user (deliverToUser).
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
  const items = all.filter((i) => !prefs.muted.has(i.billId));
  if (items.length === 0) return 0;
  const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
  const canPush = prefs.pushEnabled && hasDevice;
  let created = 0;

  const key = (i: PlannedReminder, channel: string) => dedupeKey([org.id, i.billId, i.type, i.cycleDueDate, i.offsetDays, userId, channel]);
  const base = (i: PlannedReminder) => ({
    workspaceId: org.id,
    userId,
    billId: i.billId,
    type: i.type,
    title: i.title,
    body: i.body,
    cycleDueDate: i.cycleDueDate,
    offsetDays: i.offsetDays,
    data: { ...i.emailItem },
  });

  // In-app: one per reminder (makes no noise, so ignores quiet hours).
  if (prefs.inAppEnabled) {
    for (const i of items) {
      if (await createNotification(ctx, { ...base(i), channel: 'IN_APP', dedupeKey: key(i, 'IN_APP') })) created++;
    }
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
    if (canPush && (await createNotification(ctx, { ...digest, channel: 'PUSH', dedupeKey: dedupeKey([org.id, null, 'DIGEST', today, null, userId, 'PUSH']) }, { sendAfter }))) created++;
    if (prefs.emailEnabled && (await createNotification(ctx, { ...digest, channel: 'EMAIL', dedupeKey: dedupeKey([org.id, null, 'DIGEST', today, null, userId, 'EMAIL']) }, { sendAfter }))) created++;
    return created;
  }

  for (const i of items) {
    if (canPush && (await createNotification(ctx, { ...base(i), channel: 'PUSH', dedupeKey: key(i, 'PUSH') }, { sendAfter }))) created++;
    const wantsEmail = prefs.emailEnabled && (!canPush || i.keyMoment);
    if (wantsEmail && (await createNotification(ctx, { ...base(i), channel: 'EMAIL', dedupeKey: key(i, 'EMAIL') }, { sendAfter }))) created++;
  }
  return created;
}
