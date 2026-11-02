import type { AppContext } from '../../context.js';
import { nextDueDate, previousDueDate } from '../../domain/schedule.js';

type Tx = Parameters<Parameters<AppContext['db']['$transaction']>[0]>[0];

async function paidFor(tx: Tx, obligationId: string, cycleDueDate: string): Promise<number> {
  const agg = await tx.paymentRecord.aggregate({ where: { obligationId, cycleDueDate }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

export interface CycleChange {
  /** The cycle that was completed by this change (null if none). */
  completedCycle: string | null;
  /** The cycle that was reopened by this change (null if none). */
  reopenedCycle: string | null;
  nextDueDate: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';
}

/**
 * Bring an obligation's open cycle in line with its payments after a payment is
 * recorded, edited or deleted.
 *
 * - Current cycle fully paid → advance one cycle (one-time → COMPLETED).
 * - `touchedCycle` (the cycle of an edited/deleted payment) is the one just before the
 *   current cycle, is now short, and the current cycle has no payments → reopen it.
 *   Only that one cycle can ever be reopened, so history is never rewound further.
 *
 * The advance is a conditional update on the old due date, so two concurrent
 * payments can never advance the schedule twice.
 */
export async function reconcileCycle(tx: Tx, obligationId: string, touchedCycle?: string): Promise<CycleChange> {
  const o = await tx.obligation.findUniqueOrThrow({ where: { id: obligationId } });
  const unchanged: CycleChange = { completedCycle: null, reopenedCycle: null, nextDueDate: o.nextDueDate, status: o.status };
  if (o.status === 'ARCHIVED') return unchanged;

  if (o.frequencyUnit === 'ONCE') {
    const paid = await paidFor(tx, o.id, o.nextDueDate);
    const target = paid >= o.amountMinor ? 'COMPLETED' : 'ACTIVE';
    if (target === o.status) return unchanged;
    await tx.obligation.update({ where: { id: o.id }, data: { status: target } });
    return {
      ...unchanged,
      status: target,
      completedCycle: target === 'COMPLETED' ? o.nextDueDate : null,
      reopenedCycle: target === 'ACTIVE' ? o.nextDueDate : null,
    };
  }

  const paidCurrent = await paidFor(tx, o.id, o.nextDueDate);
  if (paidCurrent >= o.amountMinor) {
    const next = nextDueDate(o.nextDueDate, o.frequencyUnit, o.frequencyInterval, o.anchorDay)!;
    const moved = await tx.obligation.updateMany({
      where: { id: o.id, nextDueDate: o.nextDueDate },
      data: { nextDueDate: next },
    });
    return moved.count === 1 ? { ...unchanged, completedCycle: o.nextDueDate, nextDueDate: next } : unchanged;
  }

  if (paidCurrent === 0 && touchedCycle) {
    const prev = previousDueDate(o.nextDueDate, o.frequencyUnit, o.frequencyInterval, o.anchorDay)!;
    if (touchedCycle === prev && (await paidFor(tx, o.id, prev)) < o.amountMinor) {
      await tx.obligation.updateMany({ where: { id: o.id, nextDueDate: o.nextDueDate }, data: { nextDueDate: prev } });
      return { ...unchanged, reopenedCycle: prev, nextDueDate: prev };
    }
  }
  return unchanged;
}
