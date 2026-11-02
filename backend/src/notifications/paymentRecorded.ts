import type { AppContext } from '../context.js';
import type { PaymentRecordedEvent } from '../modules/payments/service.js';

import { paymentRecordedCopy } from './messages.js';
import { createNotification, dedupeKey, paymentUrl, prefsFor, quietHoursEnd } from './store.js';

/**
 * "✅ Anitha recorded $132 for KT Radio hosting. Next due: 02 Oct 2028." to every
 * ADMIN and FINANCE member except the person who recorded it.
 */
export async function notifyPaymentRecorded(ctx: AppContext, e: PaymentRecordedEvent): Promise<void> {
  const [o, recorder, org, members] = await Promise.all([
    ctx.db.obligation.findUniqueOrThrow({ where: { id: e.obligationId }, include: { platform: { select: { name: true } } } }),
    ctx.db.user.findUniqueOrThrow({ where: { id: e.recordedById }, select: { name: true } }),
    ctx.db.organization.findUniqueOrThrow({ where: { id: e.organizationId } }),
    ctx.db.membership.findMany({ where: { organizationId: e.organizationId, role: { in: ['ADMIN', 'FINANCE'] } }, select: { userId: true } }),
  ]);
  const copy = paymentRecordedCopy({
    recorderName: recorder.name,
    name: o.name,
    platform: o.platform?.name,
    amountMinor: e.amountMinor,
    currency: e.currency,
    nextDueDate: o.status === 'COMPLETED' ? null : e.change.nextDueDate,
    cycleCompleted: e.change.completedCycle !== null,
  });
  const sendAfter = quietHoursEnd(ctx.clock.now(), org.timezone, org.quietHoursStart, org.quietHoursEnd);
  const url = paymentUrl(ctx, o.id);

  for (const { userId } of members) {
    if (userId === e.recordedById) continue;
    const prefs = await prefsFor(ctx, userId, e.organizationId);
    if (prefs.muted.has(o.id)) continue;
    const base = {
      organizationId: e.organizationId,
      userId,
      obligationId: o.id,
      type: 'PAYMENT_RECORDED' as const,
      title: copy.title,
      body: copy.body,
      cycleDueDate: e.cycleDueDate,
      data: { url, obligationId: o.id, paymentId: e.paymentId },
    };
    const key = (channel: string) => dedupeKey([e.organizationId, o.id, e.cycleDueDate, `payment-${e.paymentId}`, userId, channel]);
    await createNotification(ctx, { ...base, channel: 'IN_APP', dedupeKey: key('IN_APP') });
    const hasDevice = (await ctx.db.deviceToken.count({ where: { userId, active: true } })) > 0;
    if (prefs.pushEnabled && hasDevice) {
      await createNotification(ctx, { ...base, channel: 'PUSH', dedupeKey: key('PUSH') }, { sendAfter });
    }
  }
}
