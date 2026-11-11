import type { AppContext } from '../context.js';
import type { PaymentRecordedEvent } from '../modules/payments/service.js';

import { notifyMembers } from './events.js';
import { paymentRecordedCopy } from './messages.js';
import { billUrl } from './store.js';

/**
 * "✅ {amount} recorded for {Company} · {Bill}. Next due: {date}." to the workspace's
 * ADMIN and FINANCE members, except the person who recorded it (in-app + push; no email).
 */
export async function notifyPaymentRecorded(ctx: AppContext, e: PaymentRecordedEvent): Promise<void> {
  const o = await ctx.db.bill.findUniqueOrThrow({ where: { id: e.billId }, include: { company: { select: { name: true } } } });
  const copy = paymentRecordedCopy({
    name: o.name,
    company: o.company.name,
    amountCents: e.amountCents,
    nextDueDate: o.status === 'COMPLETED' ? null : e.change.nextDueDate,
    cycleCompleted: e.change.completedCycle !== null,
  });
  await notifyMembers(ctx, {
    workspaceId: e.workspaceId,
    type: 'PAYMENT_RECORDED',
    roles: ['ADMIN', 'FINANCE'],
    excludeUserId: e.actorUserId,
    billId: o.id,
    cycleDueDate: e.cycleDueDate,
    copy,
    data: { url: billUrl(ctx, o.id), billId: o.id, paymentId: e.paymentId },
    eventKey: `payment-${e.paymentId}`,
  });
}
