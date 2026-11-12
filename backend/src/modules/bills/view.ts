import {
  computeStatus,
  cycleLengthDays,
  daysBetween,
  frequencyLabel,
  paidForCycle,
  type PaymentInput,
} from '../../domain/schedule.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { expectedFor, owedNow, type StoredCycle } from '../../domain/cycles.js';
import { maskKey } from '../../lib/secretBox.js';

/** Relations every bill response includes. */
export const billInclude = {
  company: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, icon: true, color: true, parentId: true, parent: { select: { id: true, name: true } } } },
} satisfies Prisma.BillInclude;

export type BillWithRelations = Prisma.BillGetPayload<{ include: typeof billInclude }>;

/**
 * Shape returned by the API for one bill, with its computed current-cycle status.
 * The account reference is ALWAYS masked here; the plain value is only served by
 * GET /bills/:id/reference to ADMIN and FINANCE.
 */
export function billView(
  s: BillWithRelations,
  payments: readonly PaymentInput[],
  today: string,
  stored: ReadonlyMap<string, StoredCycle> = new Map(),
) {
  const paidCents = s.status === 'ACTIVE' ? paidForCycle(payments, s.nextDueDate) : 0;
  // The open cycle's own amount (a variable bill's actual, once set), else the bill's amount.
  const current = stored.get(s.nextDueDate);
  const cycleAmountCents = expectedFor(s, current);
  const paymentStatus = computeStatus({ ...s, amountCents: cycleAmountCents }, payments, today);
  const owed = owedNow(s, stored, payments, today);
  return {
    id: s.id,
    name: s.name,
    provider: s.provider,
    description: s.description,
    amountCents: s.amountCents,
    amountType: s.amountType,
    /** This cycle's amount; for a VARIABLE bill an estimate until the actual is set. */
    cycleAmountCents,
    isEstimate: s.amountType === 'VARIABLE' && !current?.isActual,
    customValues: (s.customValues as Record<string, string | number> | null) ?? {},
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
    remainingCents: paymentStatus === 'PAID' ? 0 : Math.max(0, cycleAmountCents - paidCents),
    /** Days the open cycle is past due (0 when it isn't). */
    daysOverdue: paymentStatus === 'OVERDUE' ? daysBetween(s.nextDueDate, today) : 0,
    /** Everything due on or before today, including cycles missed after the open one. */
    outstandingCents: owed.outstandingCents,
    overdueCents: owed.overdueCents,
    overdueCycles: owed.overdueCycles,
    missedCycles: owed.missedCycles,
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
