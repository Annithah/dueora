import type { AppContext } from '../context.js';
import type { PaymentRecordedEvent } from '../modules/payments/service.js';

import { paymentRecordedCopy } from './messages.js';
import { createNotification, dedupeKey, subscriptionUrl, prefsFor, quietHoursEnd } from './store.js';

/**
 * "✅ $132.00 recorded for KT Radio · Hosting. Next due: 02 Oct 2028." to every workspace
 * member except the person who recorded it (in-app + push; no email, to keep inboxes calm).
 */
export async function notifyPaymentRecorded(ctx: AppContext, e: PaymentRecordedEvent): Promise<void> {
  const [o, org, members] = await Promise.all([
    ctx.db.subscription.findUniqueOrThrow({ where: { id: e.subscriptionId }, include: { company: { select: { name: true } } } }),
    ctx.db.workspace.findUniqueOrThrow({ where: { id: e.workspaceId } }),
    ctx.db.membership.findMany({ where: { workspaceId: e.workspaceId }, select: { userId: true } }),
  ]);
  const copy = paymentRecordedCopy({
    name: o.name,
    company: o.company.name,
    amountCents: e.amountCents,
    nextDueDate: o.status === 'COMPLETED' ? null : e.change.nextDueDate,
    cycleCompleted: e.change.completedCycle !== null,
  });
  const sendAfter = quietHoursEnd(ctx.clock.now(), org.timezone, org.quietHoursStart, org.quietHoursEnd);
  const url = subscriptionUrl(ctx, o.id);

  for (const { userId } of members) {
    if (userId === e.actorUserId) continue;
    const prefs = await prefsFor(ctx, userId, e.workspaceId);
    if (prefs.muted.has(o.id)) continue;
    const base = {
      workspaceId: e.workspaceId,
      userId,
      subscriptionId: o.id,
      type: 'PAYMENT_RECORDED' as const,
      title: copy.title,
      body: copy.body,
      cycleDueDate: e.cycleDueDate,
      data: { url, subscriptionId: o.id, paymentId: e.paymentId },
    };
    const key = (channel: string) => dedupeKey([e.workspaceId, o.id, e.cycleDueDate, `payment-${e.paymentId}`, userId, channel]);
    await createNotification(ctx, { ...base, channel: 'IN_APP', dedupeKey: key('IN_APP') });
    const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
    if (prefs.pushEnabled && hasDevice) {
      await createNotification(ctx, { ...base, channel: 'PUSH', dedupeKey: key('PUSH') }, { sendAfter });
    }
  }
}
