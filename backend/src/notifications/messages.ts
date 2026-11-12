import { formatLongDate, formatShortDay, formatUSD, plural } from '../lib/format.js';

/**
 * Notification copy: human, specific, short, always in USD. Never includes an account reference.
 *
 *   ⏰ {Company} · {Bill} is due in {n} days — {amount} on {weekday, date}.
 *   📅 Today: {Company} · {Bill} — {amount}.
 *   ⚠️ {Company} · {Bill} is {n} days overdue — {amount}. Tap to record the payment.
 *   ✅ {amount} recorded for {Company} · {Bill}. Next due: {date}.
 *
 * Every name comes from the workspace's own data; nothing here is hardcoded.
 */

/** "{Company} · {Bill}" */
export function billLabel(name: string, company: string): string {
  return `${company} · ${name}`;
}

export interface ReminderCopyInput {
  name: string;
  company: string;
  /** Amount still owed on the cycle (after partial payments), in cents. */
  amountCents: number;
  dueDate: string;
  /** Days from today to the due date (negative = overdue). */
  daysUntilDue: number;
}

export interface Copy {
  title: string;
  body: string;
}

/** Reminder copy from today's point of view (also correct for catch-up sends). */
export function reminderCopy(r: ReminderCopyInput): Copy {
  const label = billLabel(r.name, r.company);
  const amount = formatUSD(r.amountCents);
  const d = r.daysUntilDue;
  if (d > 1) {
    return {
      title: `Due in ${plural(d, 'day')}`,
      body: `⏰ ${label} is due in ${plural(d, 'day')} — ${amount} on ${formatShortDay(r.dueDate)}.`,
    };
  }
  if (d === 1) {
    return { title: 'Due tomorrow', body: `⏰ ${label} is due tomorrow — ${amount} on ${formatShortDay(r.dueDate)}.` };
  }
  if (d === 0) return { title: 'Due today', body: `📅 Today: ${label} — ${amount}.` };
  return {
    title: `${plural(-d, 'day')} overdue`,
    body: `⚠️ ${label} is ${plural(-d, 'day')} overdue — ${amount}. Tap to record the payment.`,
  };
}

export function paymentRecordedCopy(input: {
  name: string;
  company: string;
  amountCents: number;
  nextDueDate: string | null;
  cycleCompleted: boolean;
}): Copy {
  const label = billLabel(input.name, input.company);
  const amount = formatUSD(input.amountCents);
  let tail: string;
  if (!input.nextDueDate) tail = 'That’s fully paid. 🎉';
  else if (input.cycleCompleted) tail = `Next due: ${formatLongDate(input.nextDueDate)}.`;
  else tail = 'Part of this cycle is still open.';
  return { title: 'Payment recorded', body: `✅ ${amount} recorded for ${label}. ${tail}` };
}

export function digestCopy(count: number, labels: string[]): Copy {
  const shown = labels.slice(0, 3).join(', ');
  const more = labels.length > 3 ? ` and ${labels.length - 3} more` : '';
  return { title: `🔔 ${plural(count, 'bill')} need attention this week`, body: `${shown}${more}.` };
}

export function trialEndingCopy(input: { name: string; daysLeft: number }): Copy {
  const when = input.daysLeft <= 0 ? 'today' : input.daysLeft === 1 ? 'tomorrow' : `in ${plural(input.daysLeft, 'day')}`;
  return { title: 'Free trial ending', body: `🎁 Your free trial of ${input.name} ends ${when} — cancel or keep it?` };
}

export function autoRenewCopy(input: { label: string; dueDate: string; amountCents: number }): Copy {
  return {
    title: 'Renews automatically soon',
    body: `🔁 ${input.label} will renew automatically on ${formatShortDay(input.dueDate)} for ${formatUSD(input.amountCents)}.`,
  };
}

export function priceChangeCopy(input: { label: string; oldAmountCents: number; newAmountCents: number }): Copy {
  const up = input.newAmountCents > input.oldAmountCents;
  return {
    title: up ? 'Price went up' : 'Price changed',
    body: `${up ? '📈' : '📉'} ${input.label} went from ${formatUSD(input.oldAmountCents)} to ${formatUSD(input.newAmountCents)}.`,
  };
}

export function budgetAlertCopy(input: { percent: number; categoryName: string | null }): Copy {
  const scope = input.categoryName ? `${input.categoryName} budget` : 'monthly budget';
  return {
    title: input.percent >= 100 ? 'Budget reached' : 'Budget alert',
    body: `📊 You've used ${input.percent}% of your ${scope} this month.`,
  };
}

export type TeamEvent = 'MEMBER_JOINED' | 'ROLE_CHANGED' | 'INVITE_ACCEPTED';

const ROLE_NAMES = { ADMIN: 'Admin', FINANCE: 'Finance', VIEWER: 'Viewer' } as const;

export function teamCopy(event: TeamEvent, memberName: string, role?: keyof typeof ROLE_NAMES): Copy {
  const r = role ? ROLE_NAMES[role] : null;
  if (event === 'ROLE_CHANGED') return { title: 'Role changed', body: `👥 ${memberName} is now ${r ?? 'in a new role'}.` };
  if (event === 'INVITE_ACCEPTED') return { title: 'Invite accepted', body: `🎉 ${memberName} accepted your invite${r ? ` as ${r}` : ''}.` };
  return { title: 'New member', body: `👋 ${memberName} joined the workspace${r ? ` as ${r}` : ''}.` };
}

/** "Alpha News $1,200.00 · Beta Radio $80.00" — amounts per company, largest first. */
export function perCompanyLine(rows: readonly { company: string; amountCents: number }[], max = 3): string {
  const list = rows.filter((r) => r.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
  const shown = list.slice(0, max).map((r) => `${r.company} ${formatUSD(r.amountCents)}`);
  return list.length > max ? `${shown.join(' · ')} · +${list.length - max} more` : shown.join(' · ');
}

export function weeklyDigestCopy(input: {
  count: number;
  totalCents: number;
  aiLine?: string | null;
  /** Still owed per company (overdue and missed cycles included). */
  outstanding?: readonly { company: string; amountCents: number }[];
}): Copy {
  const head =
    input.count === 0
      ? 'Nothing due this week — enjoy the calm. 🌿'
      : `${plural(input.count, 'bill')} due this week — ${formatUSD(input.totalCents)} in total.`;
  const owed = input.outstanding?.length ? ` Still owed: ${perCompanyLine(input.outstanding)}.` : '';
  return { title: '🗓️ Your week ahead', body: `${head}${owed}${input.aiLine ? ` ${input.aiLine}` : ''}` };
}

/** The 25th: next month's obligations, per company. */
export function nextMonthPreviewCopy(input: { monthLabel: string; count: number; totalCents: number; perCompany: readonly { company: string; amountCents: number }[] }): Copy {
  if (input.count === 0) return { title: `📅 ${input.monthLabel} preview`, body: `Nothing is due in ${input.monthLabel} yet.` };
  const split = input.perCompany.length > 1 ? ` ${perCompanyLine(input.perCompany)}.` : '';
  return {
    title: `📅 ${input.monthLabel} preview`,
    body: `${plural(input.count, 'bill')} due in ${input.monthLabel} — ${formatUSD(input.totalCents)}.${split}`,
  };
}

/** A variable bill is due soon and its real amount isn't set yet. */
export function amountNeededCopy(input: { label: string; dueDate: string; estimateCents: number; daysUntilDue: number }): Copy {
  return {
    title: `✏️ ${input.label}: amount needed`,
    body: `Due in ${plural(input.daysUntilDue, 'day')} (${formatLongDate(input.dueDate)}). Set this cycle's real amount — the estimate is ${formatUSD(input.estimateCents)}.`,
  };
}

export function monthlySummaryCopy(input: {
  monthLabel: string;
  paidCents: number;
  comingCents: number;
  comingCount: number;
  /** This month's obligations per company (shown when there are several). */
  perCompany?: readonly { company: string; amountCents: number }[];
}): Copy {
  const split = (input.perCompany?.length ?? 0) > 1 ? ` (${perCompanyLine(input.perCompany!)})` : '';
  return {
    title: `📈 ${input.monthLabel} report is ready`,
    body: `You paid ${formatUSD(input.paidCents)} in ${input.monthLabel}. This month's obligations: ${plural(input.comingCount, 'bill')}, ${formatUSD(input.comingCents)}${split}.`,
  };
}
