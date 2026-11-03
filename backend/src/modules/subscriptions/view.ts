import {
  computeStatus,
  cycleLengthDays,
  daysBetween,
  frequencyLabel,
  paidForCycle,
  type PaymentInput,
} from '../../domain/schedule.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { maskKey } from '../../lib/secretBox.js';

/** Relations every subscription response includes. */
export const subscriptionInclude = {
  company: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} satisfies Prisma.SubscriptionInclude;

export type SubscriptionWithRelations = Prisma.SubscriptionGetPayload<{ include: typeof subscriptionInclude }>;

/**
 * Shape returned by the API for one subscription, with its computed current-cycle status.
 * The subscription key is ALWAYS masked here; the plain value is only served by
 * GET /subscriptions/:id/key to ADMIN and FINANCE.
 */
export function subscriptionView(s: SubscriptionWithRelations, payments: readonly PaymentInput[], today: string) {
  const paidCents = s.status === 'ACTIVE' ? paidForCycle(payments, s.nextDueDate) : 0;
  const paymentStatus = computeStatus(s, payments, today);
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    description: s.description,
    amountCents: s.amountCents,
    frequencyUnit: s.frequencyUnit,
    frequencyInterval: s.frequencyInterval,
    frequencyLabel: frequencyLabel(s.frequencyUnit, s.frequencyInterval),
    anchorDay: s.anchorDay,
    startDate: s.startDate,
    nextDueDate: s.nextDueDate,
    reminderOffsets: s.reminderOffsets as number[],
    status: s.status,
    paymentStatus,
    daysUntilDue: daysBetween(today, s.nextDueDate),
    cycleLengthDays: cycleLengthDays(s.nextDueDate, s.frequencyUnit, s.frequencyInterval, s.anchorDay, s.startDate),
    paidCents,
    remainingCents: paymentStatus === 'PAID' ? 0 : Math.max(0, s.amountCents - paidCents),
    subscriptionKey: s.subscriptionKeyLast4
      ? { hasKey: true, last4: s.subscriptionKeyLast4, masked: maskKey(s.subscriptionKeyLast4) }
      : null,
    company: s.company,
    category: s.category,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type SubscriptionView = ReturnType<typeof subscriptionView>;
