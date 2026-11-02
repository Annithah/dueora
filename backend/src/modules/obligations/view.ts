import {
  computeStatus,
  cycleLengthDays,
  daysBetween,
  frequencyLabel,
  paidForCycle,
  type PaymentInput,
} from '../../domain/schedule.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Relations every obligation response includes. */
export const obligationInclude = {
  platform: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true, icon: true, color: true } },
  department: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.ObligationInclude;

export type ObligationWithRelations = Prisma.ObligationGetPayload<{ include: typeof obligationInclude }>;

/** Shape returned by the API for one obligation, with its computed current-cycle status. */
export function obligationView(o: ObligationWithRelations, payments: readonly PaymentInput[], today: string) {
  const paidMinor = o.status === 'ACTIVE' ? paidForCycle(payments, o.nextDueDate) : 0;
  const paymentStatus = computeStatus(o, payments, today);
  return {
    id: o.id,
    name: o.name,
    provider: o.provider,
    description: o.description,
    icon: o.icon ?? o.category.icon,
    amountMinor: o.amountMinor,
    currency: o.currency,
    frequencyUnit: o.frequencyUnit,
    frequencyInterval: o.frequencyInterval,
    frequencyLabel: frequencyLabel(o.frequencyUnit, o.frequencyInterval),
    anchorDay: o.anchorDay,
    startDate: o.startDate,
    nextDueDate: o.nextDueDate,
    reminderOffsets: o.reminderOffsets as number[],
    status: o.status,
    paymentStatus,
    daysUntilDue: daysBetween(today, o.nextDueDate),
    cycleLengthDays: cycleLengthDays(o.nextDueDate, o.frequencyUnit, o.frequencyInterval, o.anchorDay, o.startDate),
    paidMinor,
    remainingMinor: paymentStatus === 'PAID' ? 0 : Math.max(0, o.amountMinor - paidMinor),
    platform: o.platform,
    category: o.category,
    department: o.department,
    assignee: o.assignee,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export type ObligationView = ReturnType<typeof obligationView>;
