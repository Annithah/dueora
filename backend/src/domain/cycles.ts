/**
 * Bill cycles (pure, no I/O) — Finalize brief, Part 4.
 *
 * A bill's schedule is a series of due dates. For any date range this lists each cycle with
 * its own expected amount (a stored BillCycle row, else the bill's current amount), what was
 * paid, what is left and its state. Closed cycles come from history, so totals for the past
 * stay exact when the bill's amount changes later.
 *
 * Kinds:
 * - closed   before the open cycle: fully paid (or marked "paid in full")
 * - current  the open cycle (bill.nextDueDate)
 * - missed   after the open cycle but already past due: an unpaid recurring bill that fell
 *            behind several cycles owes every one of them (they all count as overdue)
 * - future   not due yet
 */
import { advance, daysBetween, DUE_SOON_DAYS, type FrequencyUnit } from './schedule.js';

export type CycleState = 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'UPCOMING';
export type CycleKind = 'closed' | 'current' | 'missed' | 'future';

export interface CycleBill {
  status: string;
  amountType: 'FIXED' | 'VARIABLE';
  amountCents: number;
  nextDueDate: string;
  frequencyUnit: FrequencyUnit;
  frequencyInterval: number;
  anchorDay: number;
}

export interface StoredCycle {
  dueDate: string;
  amountCents: number;
  isActual: boolean;
  closedAt: Date | null;
}

export interface CyclePayment {
  cycleDueDate: string;
  amountCents: number;
}

export interface Cycle {
  dueDate: string;
  kind: CycleKind;
  expectedCents: number;
  /** A variable bill whose real amount for this cycle isn't known yet. */
  isEstimate: boolean;
  paidCents: number;
  remainingCents: number;
  state: CycleState;
  /** Days past the due date (0 when not overdue). */
  daysOverdue: number;
}

const MAX_CYCLES = 600;

function stateOf(dueDate: string, expected: number, paid: number, today: string, closed: boolean): CycleState {
  if (closed || paid >= expected) return 'PAID';
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'OVERDUE';
  if (paid > 0) return 'PARTIALLY_PAID';
  if (days === 0) return 'DUE_TODAY';
  if (days <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'UPCOMING';
}

/** Expected amount of one cycle: its stored amount, else the bill's current amount. */
export function expectedFor(bill: Pick<CycleBill, 'amountCents'>, stored: StoredCycle | undefined): number {
  return stored?.amountCents ?? bill.amountCents;
}

/**
 * Every cycle of `bill` due in [from, to]. Closed cycles are listed when they have payments or a
 * stored row; open, missed and future cycles come from the schedule (archived and completed bills
 * have no open cycles).
 */
export function cyclesBetween(
  bill: CycleBill,
  stored: ReadonlyMap<string, StoredCycle>,
  payments: readonly CyclePayment[],
  from: string,
  to: string,
  today: string,
): Cycle[] {
  const paidBy = new Map<string, number>();
  for (const p of payments) paidBy.set(p.cycleDueDate, (paidBy.get(p.cycleDueDate) ?? 0) + p.amountCents);
  const make = (dueDate: string, kind: CycleKind): Cycle => {
    const row = stored.get(dueDate);
    const expected = expectedFor(bill, row);
    const paid = paidBy.get(dueDate) ?? 0;
    const closed = kind === 'closed';
    const state = stateOf(dueDate, expected, paid, today, closed);
    return {
      dueDate,
      kind,
      expectedCents: expected,
      isEstimate: bill.amountType === 'VARIABLE' && !row?.isActual && !closed,
      paidCents: paid,
      remainingCents: state === 'PAID' ? 0 : Math.max(0, expected - paid),
      state,
      daysOverdue: state === 'OVERDUE' ? daysBetween(dueDate, today) : 0,
    };
  };

  const out: Cycle[] = [];
  const open = bill.status === 'ACTIVE';
  // History: anything before the open cycle (or every cycle of a completed/archived bill).
  const historic = new Set<string>([...paidBy.keys(), ...[...stored.values()].filter((c) => c.closedAt).map((c) => c.dueDate)]);
  for (const d of historic) {
    if (d < from || d > to) continue;
    if (open && d >= bill.nextDueDate) continue;
    out.push(make(d, 'closed'));
  }
  if (open) {
    let date: string | null = bill.nextDueDate;
    for (let i = 0; date && date <= to && i < MAX_CYCLES; i++) {
      const kind: CycleKind = i === 0 ? 'current' : date < today ? 'missed' : 'future';
      if (date >= from) out.push(make(date, kind));
      if (bill.frequencyUnit === 'ONCE') break;
      date = advance(date, bill.frequencyUnit, bill.frequencyInterval, bill.anchorDay);
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** What a bill owes right now: the open cycle plus every missed one (all due on or before today). */
export function owedNow(bill: CycleBill, stored: ReadonlyMap<string, StoredCycle>, payments: readonly CyclePayment[], today: string) {
  if (bill.status !== 'ACTIVE') return { outstandingCents: 0, overdueCents: 0, overdueCycles: 0, missedCycles: 0, oldestDueDate: null as string | null };
  const due = cyclesBetween(bill, stored, payments, bill.nextDueDate, today, today).filter((c) => c.kind !== 'closed' && c.remainingCents > 0);
  const overdue = due.filter((c) => c.state === 'OVERDUE');
  return {
    outstandingCents: due.reduce((s, c) => s + c.remainingCents, 0),
    overdueCents: overdue.reduce((s, c) => s + c.remainingCents, 0),
    overdueCycles: overdue.length,
    missedCycles: due.filter((c) => c.kind === 'missed').length,
    oldestDueDate: due[0]?.dueDate ?? null,
  };
}
