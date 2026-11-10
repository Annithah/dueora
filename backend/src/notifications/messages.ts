import { formatLongDate, formatShortDay, formatUSD, plural } from '../lib/format.js';

/**
 * Notification copy: human, specific, short, always in USD. Never includes a subscription key.
 *
 *   ⏰ {Company} · {Subscription} is due in {n} days — {amount} on {weekday, date}.
 *   📅 Today: {Company} · {Subscription} — {amount}.
 *   ⚠️ {Company} · {Subscription} is {n} days overdue — {amount}. Tap to record the payment.
 *   ✅ {amount} recorded for {Company} · {Subscription}. Next due: {date}.
 *
 * Every name comes from the workspace's own data; nothing here is hardcoded.
 */

/** "{Company} · {Subscription}" */
export function subscriptionLabel(name: string, company: string): string {
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
  const label = subscriptionLabel(r.name, r.company);
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
  const label = subscriptionLabel(input.name, input.company);
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
  return { title: `🔔 ${plural(count, 'subscription')} need attention this week`, body: `${shown}${more}.` };
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

export function weeklyDigestCopy(input: { count: number; totalCents: number; aiLine?: string | null }): Copy {
  const head =
    input.count === 0
      ? 'Nothing due this week — enjoy the calm. 🌿'
      : `${plural(input.count, 'subscription')} due this week — ${formatUSD(input.totalCents)} in total.`;
  return { title: '🗓️ Your week ahead', body: input.aiLine ? `${head} ${input.aiLine}` : head };
}

export function monthlySummaryCopy(input: { monthLabel: string; paidCents: number; comingCents: number; comingCount: number }): Copy {
  return {
    title: `📈 ${input.monthLabel} in review`,
    body: `You paid ${formatUSD(input.paidCents)} in ${input.monthLabel}. This month: ${plural(input.comingCount, 'subscription')}, ${formatUSD(input.comingCents)}.`,
  };
}
