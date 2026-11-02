import { formatLongDate, formatMoney, formatShortDay, plural } from '../lib/format.js';

/** Words that read naturally after a platform name: "KigaliToday hosting". */
const GENERIC = new Set([
  'hosting',
  'domain',
  'domains',
  'internet',
  'rent',
  'insurance',
  'electricity',
  'water',
  'cleaning',
  'security',
  'maintenance',
  'subscription',
  'licence',
  'license',
  'website',
  'email',
  'server',
  'backup',
  'office',
  'fibre',
  'fiber',
  'phone',
]);

/**
 * How we refer to an obligation in copy:
 * - "Hosting" on platform "KigaliToday" → "KigaliToday hosting"
 * - "Cloudflare" on "KigaliToday" → "Cloudflare (KigaliToday)"
 * - no platform → the name as-is
 */
export function obligationLabel(name: string, platform?: string | null): string {
  if (!platform || name.toLowerCase().includes(platform.toLowerCase())) return name;
  const firstWord = name.split(/\s+/)[0]?.toLowerCase() ?? '';
  if (GENERIC.has(firstWord)) return `${platform} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return `${name} (${platform})`;
}

export interface ReminderCopyInput {
  name: string;
  platform?: string | null;
  /** Amount still owed on the cycle (after partial payments). */
  amountMinor: number;
  currency: string;
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
  const label = obligationLabel(r.name, r.platform);
  const amount = formatMoney(r.amountMinor, r.currency);
  const d = r.daysUntilDue;
  if (d > 1) {
    return { title: `Due in ${plural(d, 'day')}`, body: `⏰ ${label} is due in ${plural(d, 'day')} — ${amount} on ${formatShortDay(r.dueDate)}.` };
  }
  if (d === 1) return { title: 'Due tomorrow', body: `⏰ ${label} is due tomorrow — ${amount}.` };
  if (d === 0) return { title: 'Due today', body: `📅 Today: ${label} — ${amount}.` };
  return {
    title: `${plural(-d, 'day')} overdue`,
    body: `⚠️ ${label} is ${plural(-d, 'day')} overdue — ${amount}. Tap to record the payment.`,
  };
}

export function paymentRecordedCopy(input: {
  recorderName: string;
  name: string;
  platform?: string | null;
  amountMinor: number;
  currency: string;
  nextDueDate: string | null;
  cycleCompleted: boolean;
}): Copy {
  const who = input.recorderName.trim().split(/\s+/)[0] ?? input.recorderName;
  const label = obligationLabel(input.name, input.platform);
  const amount = formatMoney(input.amountMinor, input.currency);
  let tail: string;
  if (!input.nextDueDate) tail = 'That’s fully paid. 🎉';
  else if (input.cycleCompleted) tail = `Next due: ${formatLongDate(input.nextDueDate)}.`;
  else tail = 'Part of this cycle is still open.';
  return { title: 'Payment recorded', body: `✅ ${who} recorded ${amount} for ${label}. ${tail}` };
}

export function digestCopy(count: number, labels: string[]): Copy {
  const shown = labels.slice(0, 3).join(', ');
  const more = labels.length > 3 ? ` and ${labels.length - 3} more` : '';
  return { title: `🔔 ${count} payments need attention this week`, body: `${shown}${more}.` };
}
