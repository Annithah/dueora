import type { AppContext } from '../../context.js';
import { advance, previousDueDate } from '../../domain/schedule.js';

type Tx = Parameters<Parameters<AppContext['db']['$transaction']>[0]>[0];

async function paidFor(tx: Tx, billId: string, cycleDueDate: string): Promise<number> {
  const agg = await tx.paymentRecord.aggregate({ where: { billId, cycleDueDate }, _sum: { amountCents: true } });
  return agg._sum.amountCents ?? 0;
}

/** The amount one cycle expects: its stored BillCycle amount, else the bill's current amount. */
export async function expectedCents(tx: Tx, bill: { id: string; amountCents: number }, dueDate: string): Promise<number> {
  const row = await tx.billCycle.findUnique({ where: { billId_dueDate: { billId: bill.id, dueDate } } });
  return row?.amountCents ?? bill.amountCents;
}

/**
 * Store a cycle when it closes, with the amount it expected and what was paid, so history
 * stays exact when the bill's amount changes later. `paidInFull` closes it at the paid amount.
 */
async function closeCycle(tx: Tx, bill: { id: string; workspaceId: string; amountCents: number }, dueDate: string, paid: number, at: Date, paidInFull: boolean) {
  const expected = await expectedCents(tx, bill, dueDate);
  const amountCents = paidInFull ? paid : expected;
  await tx.billCycle.upsert({
    where: { billId_dueDate: { billId: bill.id, dueDate } },
    create: { workspaceId: bill.workspaceId, billId: bill.id, dueDate, amountCents, isActual: paidInFull, paidCents: paid, closedAt: at },
    update: { paidCents: paid, closedAt: at, ...(paidInFull ? { amountCents, isActual: true } : {}) },
  });
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
 * Bring a bill's open cycle in line with its payments after a payment is
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
export async function reconcileCycle(
  tx: Tx,
  billId: string,
  touchedCycle?: string,
  opts: { now?: Date; paidInFull?: boolean } = {},
): Promise<CycleChange> {
  const o = await tx.bill.findUniqueOrThrow({ where: { id: billId } });
  const unchanged: CycleChange = { completedCycle: null, reopenedCycle: null, nextDueDate: o.nextDueDate, status: o.status };
  if (o.status === 'ARCHIVED') return unchanged;
  const now = opts.now ?? new Date();

  if (o.frequencyUnit === 'ONCE') {
    const paid = await paidFor(tx, o.id, o.nextDueDate);
    const full = paid >= (await expectedCents(tx, o, o.nextDueDate)) || (!!opts.paidInFull && paid > 0);
    const target = full ? 'COMPLETED' : 'ACTIVE';
    if (target === o.status) return unchanged;
    await tx.bill.update({ where: { id: o.id }, data: { status: target } });
    if (target === 'COMPLETED') await closeCycle(tx, o, o.nextDueDate, paid, now, !!opts.paidInFull && paid < (await expectedCents(tx, o, o.nextDueDate)));
    else await tx.billCycle.updateMany({ where: { billId: o.id, dueDate: o.nextDueDate }, data: { closedAt: null, paidCents: paid } });
    return {
      ...unchanged,
      status: target,
      completedCycle: target === 'COMPLETED' ? o.nextDueDate : null,
      reopenedCycle: target === 'ACTIVE' ? o.nextDueDate : null,
    };
  }

  const paidCurrent = await paidFor(tx, o.id, o.nextDueDate);
  const expectedCurrent = await expectedCents(tx, o, o.nextDueDate);
  const paidInFull = !!opts.paidInFull && paidCurrent > 0 && paidCurrent < expectedCurrent;
  if (paidCurrent >= expectedCurrent || paidInFull) {
    const next = advance(o.nextDueDate, o.frequencyUnit, o.frequencyInterval, o.anchorDay)!;
    const moved = await tx.bill.updateMany({
      where: { id: o.id, nextDueDate: o.nextDueDate },
      data: { nextDueDate: next },
    });
    if (moved.count !== 1) return unchanged;
    await closeCycle(tx, o, o.nextDueDate, paidCurrent, now, paidInFull);
    return { ...unchanged, completedCycle: o.nextDueDate, nextDueDate: next };
  }

  if (paidCurrent === 0 && touchedCycle) {
    const prev = previousDueDate(o.nextDueDate, o.frequencyUnit, o.frequencyInterval, o.anchorDay)!;
    const paidPrev = await paidFor(tx, o.id, prev);
    const prevRow = await tx.billCycle.findUnique({ where: { billId_dueDate: { billId: o.id, dueDate: prev } } });
    // "Paid in full" stored the paid amount as the cycle's amount, so a smaller total reopens it.
    const prevExpected = prevRow?.amountCents ?? o.amountCents;
    if (touchedCycle === prev && paidPrev < prevExpected) {
      await tx.bill.updateMany({ where: { id: o.id, nextDueDate: o.nextDueDate }, data: { nextDueDate: prev } });
      await tx.billCycle.updateMany({ where: { billId: o.id, dueDate: prev }, data: { closedAt: null, paidCents: paidPrev } });
      return { ...unchanged, reopenedCycle: prev, nextDueDate: prev };
    }
    if (prevRow) await tx.billCycle.update({ where: { id: prevRow.id }, data: { paidCents: paidPrev } });
  }
  return unchanged;
}
