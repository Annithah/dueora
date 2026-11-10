import type { AppContext } from '../context.js';
import { digestEmail, itemsHtml, notificationEmail, reminderEmail, type ReminderEmailItem } from '../emails/reminder.js';
import type { NotificationType, Prisma } from '../generated/prisma/client.js';
import { enqueue, PermanentJobError, type JobHandler } from '../jobs/queue.js';
import { TransientEmailError, type EmailMessage } from '../services/mailer.js';

import type { PushMessage } from './push.js';
import { TransientPushError } from './push.js';
import { cancellationReason, createNotification, markCancelled, prefsFor, QUEUES } from './store.js';
import { unsubscribeUrl } from './unsubscribe.js';

const MAX_ATTEMPTS = 5;
const RECEIPT_DELAY_MS = 15 * 60_000;

interface Ticket {
  token: string;
  id: string;
}

/** Android channel per type (created by the app: reminders, overdue, digest, team). */
export function channelFor(type: NotificationType): string {
  switch (type) {
    case 'OVERDUE':
      return 'overdue';
    case 'DIGEST':
    case 'WEEKLY_DIGEST':
    case 'MONTHLY_SUMMARY':
      return 'digest';
    case 'TEAM':
      return 'team';
    default:
      return 'reminders';
  }
}

/** Pushes about one unpaid cycle get the Mark as paid / Snooze / Open buttons. */
export function categoryFor(type: NotificationType): string | undefined {
  return type === 'REMINDER' || type === 'DUE_TODAY' || type === 'OVERDUE' ? 'subscription-reminder' : undefined;
}

async function unreadCount(ctx: AppContext, userId: string): Promise<number> {
  return ctx.db.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } });
}

async function loadPending(ctx: AppContext, notificationId: string) {
  const n = await ctx.db.notification.findUnique({
    where: { id: notificationId },
    include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { name: true } } },
  });
  // Already sent (or cancelled): delivery jobs are idempotent.
  return n && n.status === 'PENDING' ? n : null;
}

/** Push to every active device of the user. Transient failures throw so the queue retries. */
export const deliverPush: JobHandler = async (ctx, payload) => {
  const n = await loadPending(ctx, String(payload.notificationId));
  if (!n) return;
  // The notification counts attempts across jobs (receipt-triggered resends start new jobs).
  const attempt = n.attempts + 1;
  const prefs = await prefsFor(ctx, n.userId, n.workspaceId);
  const reason = !prefs.pushEnabled ? 'cancelled: push disabled' : await cancellationReason(ctx, n, prefs);
  if (reason) return markCancelled(ctx, n.id, reason);

  const tokens = await ctx.db.deviceToken.findMany({ where: { userId: n.userId, active: true }, select: { expoPushToken: true } });
  if (tokens.length === 0) return fallbackToEmail(ctx, n, prefs.emailEnabled, 'no active device');

  const data = n.data as Record<string, unknown>;
  const overdue = n.type === 'OVERDUE';
  const badge = await unreadCount(ctx, n.userId);
  const category = categoryFor(n.type);
  const messages: PushMessage[] = tokens.map((t) => ({
    to: t.expoPushToken,
    title: n.title,
    body: n.body,
    sound: 'default',
    badge,
    priority: overdue ? 'high' : 'default',
    channelId: channelFor(n.type),
    ...(category ? { categoryId: category } : {}),
    data: {
      url: data.url,
      subscriptionId: n.subscriptionId,
      cycleDueDate: n.cycleDueDate,
      notificationId: n.id,
      type: n.type,
      // Lets the app cancel its local backup reminder for the same event.
      dedupeKey: n.dedupeKey.replace(/:PUSH$/, ''),
    },
  }));

  let tickets;
  try {
    tickets = await ctx.push.send(messages);
  } catch (err) {
    const giveUp = !(err instanceof TransientPushError) || attempt >= MAX_ATTEMPTS;
    await ctx.db.notification.update({
      where: { id: n.id },
      data: { attempts: attempt, error: err instanceof Error ? err.message : String(err), status: giveUp ? 'FAILED' : 'PENDING' },
    });
    if (giveUp) throw new PermanentJobError(String(err));
    throw err;
  }

  const ok: Ticket[] = [];
  const errors: string[] = [];
  for (const [i, t] of tickets.entries()) {
    const token = messages[i]!.to;
    if (t.status === 'ok') ok.push({ token, id: t.id });
    else {
      errors.push(`${t.details?.error ?? 'Error'}: ${t.message}`);
      if (t.details?.error === 'DeviceNotRegistered') await deactivateToken(ctx, token);
    }
  }

  if (ok.length === 0) {
    await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'FAILED', attempts: attempt, error: errors.join('; ').slice(0, 500) } });
    if (errors.every((e) => e.startsWith('DeviceNotRegistered'))) {
      await fallbackToEmail(ctx, { ...n, status: 'FAILED' }, prefs.emailEnabled, 'device not registered');
    }
    return;
  }
  await ctx.db.notification.update({
    where: { id: n.id },
    data: {
      status: 'SENT',
      sentAt: ctx.clock.now(),
      attempts: attempt,
      pushTicketId: ok[0]!.id,
      error: errors.length ? errors.join('; ').slice(0, 500) : null,
      data: { ...data, tickets: ok } as unknown as Prisma.InputJsonValue,
    },
  });
};

async function deactivateToken(ctx: AppContext, token: string) {
  await ctx.db.deviceToken.updateMany({ where: { expoPushToken: token }, data: { active: false } });
}

/** No device to push to: send the same message by email instead (if the user allows email). */
async function fallbackToEmail(
  ctx: AppContext,
  n: NonNullable<Awaited<ReturnType<typeof loadPending>>>,
  emailEnabled: boolean,
  why: string,
) {
  if (n.status === 'PENDING') await markCancelled(ctx, n.id, `no push: ${why}`);
  if (!emailEnabled) return;
  await createNotification(ctx, {
    workspaceId: n.workspaceId,
    userId: n.userId,
    subscriptionId: n.subscriptionId,
    type: n.type,
    channel: 'EMAIL',
    title: n.title,
    body: n.body,
    data: n.data as Record<string, unknown>,
    cycleDueDate: n.cycleDueDate,
    offsetDays: n.offsetDays,
    dedupeKey: n.dedupeKey.replace(/:PUSH$/, ':EMAIL'),
  });
}

function buildEmail(ctx: AppContext, n: NonNullable<Awaited<ReturnType<typeof loadPending>>>): EmailMessage {
  const data = n.data as Record<string, unknown>;
  const links = {
    preferencesUrl: `${ctx.env.APP_URL}settings/notifications`,
    unsubscribeUrl: unsubscribeUrl(ctx, n.userId, n.workspaceId),
  };
  const common = { to: n.user.email, orgName: n.workspace.name, links };
  const url = String(data.url ?? ctx.env.APP_URL);
  const items = (data.items ?? []) as ReminderEmailItem[];
  switch (n.type) {
    case 'REMINDER':
    case 'DUE_TODAY':
    case 'OVERDUE':
      return reminderEmail({ ...common, title: n.title, body: n.body, item: data as unknown as ReminderEmailItem });
    case 'DIGEST':
      return digestEmail({ ...common, name: n.user.name, items, appUrl: url });
    default:
      return notificationEmail({
        to: n.user.email,
        tag: n.type.toLowerCase().replace(/_/g, '-'),
        title: n.title,
        body: n.body,
        url,
        extraHtml: itemsHtml(items),
        links,
      });
  }
}

export const deliverEmail: JobHandler = async (ctx, payload) => {
  const n = await loadPending(ctx, String(payload.notificationId));
  if (!n) return;
  const attempt = n.attempts + 1;
  const prefs = await prefsFor(ctx, n.userId, n.workspaceId);
  const reason = !prefs.emailEnabled && n.type !== 'SYSTEM' ? 'cancelled: email disabled' : await cancellationReason(ctx, n, prefs);
  if (reason) return markCancelled(ctx, n.id, reason);

  try {
    await ctx.mailer.send(buildEmail(ctx, n));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = !(err instanceof TransientEmailError) || attempt >= MAX_ATTEMPTS;
    await ctx.db.notification.update({
      where: { id: n.id },
      data: { attempts: attempt, error: message.slice(0, 500), status: giveUp ? 'FAILED' : 'PENDING' },
    });
    if (giveUp) throw new PermanentJobError(message);
    throw err;
  }
  await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'SENT', sentAt: ctx.clock.now(), attempts: attempt, error: null } });
};

/**
 * ~15 minutes after sending, ask Expo whether each push actually reached the device.
 * ok → DELIVERED; DeviceNotRegistered → deactivate token; other errors → resend (≤ 5 attempts).
 */
export const checkReceipts: JobHandler = async (ctx) => {
  const cutoff = new Date(ctx.clock.now().getTime() - RECEIPT_DELAY_MS);
  const sent = await ctx.db.notification.findMany({
    where: { channel: 'PUSH', status: 'SENT', sentAt: { lte: cutoff } },
    select: { id: true, data: true, attempts: true },
    take: 1000,
  });
  if (sent.length === 0) return;

  const ticketsByNotification = new Map(sent.map((n) => [n.id, ((n.data as { tickets?: Ticket[] }).tickets ?? [])]));
  const allIds = [...ticketsByNotification.values()].flat().map((t) => t.id);
  const receipts = allIds.length ? await ctx.push.receipts(allIds) : {};

  for (const n of sent) {
    const tickets = ticketsByNotification.get(n.id) ?? [];
    const results = tickets.map((t) => ({ t, r: receipts[t.id] }));
    if (results.some(({ r }) => !r)) continue; // Expo hasn't produced every receipt yet
    const failures = results.filter(({ r }) => r!.status === 'error');
    for (const { t, r } of failures) {
      if (r!.status === 'error' && r!.details?.error === 'DeviceNotRegistered') await deactivateToken(ctx, t.token);
    }
    if (failures.length < results.length) {
      await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'DELIVERED' } });
      continue;
    }
    const errorText = failures.map(({ r }) => (r!.status === 'error' ? `${r!.details?.error ?? 'Error'}: ${r!.message}` : '')).join('; ');
    const retryable = failures.some(({ r }) => r!.status === 'error' && r!.details?.error !== 'DeviceNotRegistered');
    if (retryable && n.attempts < MAX_ATTEMPTS) {
      await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'PENDING', error: errorText.slice(0, 500) } });
      await enqueue(ctx, QUEUES.push, { notificationId: n.id });
    } else {
      await ctx.db.notification.update({ where: { id: n.id }, data: { status: 'FAILED', error: errorText.slice(0, 500) } });
    }
  }
};
