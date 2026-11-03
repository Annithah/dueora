import { formatLongDate, formatShortDay, formatUSD, plural } from '../lib/format.js';

/**
 * Notification copy: human, specific, short, always in USD. Never includes a subscription key.
 *
 *   ⏰ KigaliToday · Hosting is due in 7 days — $1,523.00 on Tue, 20 Oct.
 *   📅 Today: KT Radio · Domain renewal — $13.00.
 *   ⚠️ KigaliToday · Cloudflare is 3 days overdue — $240.00. Tap to record the payment.
 *   ✅ $132.00 recorded for KT Radio · Hosting. Next due: 02 Oct 2028.
 */

/** "KigaliToday · Hosting" */
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
