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

/** Relations every bill response includes. */
export const billInclude = {
  company: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
} satisfies Prisma.BillInclude;

export type BillWithRelations = Prisma.BillGetPayload<{ include: typeof billInclude }>;

/**
 * Shape returned by the API for one bill, with its computed current-cycle status.
 * The account reference is ALWAYS masked here; the plain value is only served by
 * GET /bills/:id/reference to ADMIN and FINANCE.
 */
export function billView(s: BillWithRelations, payments: readonly PaymentInput[], today: string) {
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
    autoRenew: s.autoRenew,
    isTrial: s.isTrial,
    trialEndsOn: s.trialEndsOn,
    defaultPaymentMethod: s.defaultPaymentMethod,
    status: s.status,
    paymentStatus,
    daysUntilDue: daysBetween(today, s.nextDueDate),
    cycleLengthDays: cycleLengthDays(s.nextDueDate, s.frequencyUnit, s.frequencyInterval, s.anchorDay, s.startDate),
    paidCents,
    remainingCents: paymentStatus === 'PAID' ? 0 : Math.max(0, s.amountCents - paidCents),
    accountReference: s.accountRefLast4
      ? { hasKey: true, last4: s.accountRefLast4, masked: maskKey(s.accountRefLast4) }
      : null,
    company: s.company,
    category: s.category,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export type BillView = ReturnType<typeof billView>;
