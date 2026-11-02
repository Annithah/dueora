import { formatLongDate, formatMoney } from '../lib/format.js';
import type { EmailMessage } from '../services/mailer.js';

import { esc, renderLayout } from './layout.js';

type Badge = 'UPCOMING' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'PARTIALLY_PAID';

const BADGES: Record<Badge, { label: string; fg: string; bg: string; icon: string }> = {
  UPCOMING: { label: 'Upcoming', fg: '#2469CF', bg: '#E8F1FF', icon: '🕒' },
  DUE_SOON: { label: 'Due soon', fg: '#A35900', bg: '#FFF0D5', icon: '⏰' },
  DUE_TODAY: { label: 'Due today', fg: '#BB4109', bg: '#FFEADF', icon: '📅' },
  OVERDUE: { label: 'Overdue', fg: '#C82020', bg: '#FFE8E7', icon: '⚠️' },
  PARTIALLY_PAID: { label: 'Partially paid', fg: '#6D36CC', bg: '#F0EAFF', icon: '💜' },
};

export function badgeFor(daysUntilDue: number, partiallyPaid: boolean): Badge {
  if (daysUntilDue < 0) return 'OVERDUE';
  if (partiallyPaid) return 'PARTIALLY_PAID';
  if (daysUntilDue === 0) return 'DUE_TODAY';
  if (daysUntilDue <= 7) return 'DUE_SOON';
  return 'UPCOMING';
}

/** Status pill with icon + text (never colour alone). */
function badgeHtml(b: Badge): string {
  const s = BADGES[b];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${s.bg};color:${s.fg};font-size:12px;font-weight:800">${s.icon} ${s.label}</span>`;
}

export interface ReminderEmailItem {
  label: string;
  provider: string;
  amountMinor: number;
  currency: string;
  dueDate: string;
  daysUntilDue: number;
  partiallyPaid: boolean;
  url: string;
}

function itemRow(i: ReminderEmailItem): string {
  return `<tr><td style="padding:12px 0;border-top:1px solid #E7EBEB">
    <div style="font-weight:700;font-size:15px">${esc(i.label)}</div>
    <div style="color:#667373;font-size:13px">${esc(i.provider)} · due ${esc(formatLongDate(i.dueDate))}</div>
    <div style="margin-top:6px">${badgeHtml(badgeFor(i.daysUntilDue, i.partiallyPaid))}
      <span style="float:right;font-weight:800;font-size:15px">${esc(formatMoney(i.amountMinor, i.currency))}</span></div>
  </td></tr>`;
}

export function reminderEmail(opts: {
  to: string;
  orgName: string;
  logoUrl?: string | null;
  title: string;
  body: string;
  item: ReminderEmailItem;
}): EmailMessage {
  const i = opts.item;
  const amount = formatMoney(i.amountMinor, i.currency);
  return {
    to: opts.to,
    tag: 'reminder',
    subject: opts.body.replace(/ Tap to record the payment\.$/, ''),
    html: renderLayout({
      preheader: opts.body,
      heading: opts.title,
      logoUrl: opts.logoUrl,
      bodyHtml: `
        <p style="margin:0 0 16px">${esc(opts.body)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;border-radius:14px;padding:0 16px">
          ${itemRow(i)}
        </table>
        <p style="margin:16px 0 8px;color:#667373;font-size:13px">Amount: <b style="color:#172121">${esc(amount)}</b> · Due ${esc(formatLongDate(i.dueDate))}</p>`,
      button: { label: 'Open in DueOra', url: i.url },
      footerNote: `You're receiving this because you're part of ${opts.orgName} on DueOra. Change email reminders in Settings → Notifications.`,
    }),
    text: `${opts.body}\n\n${i.label} — ${i.provider}\nAmount: ${amount}\nDue: ${formatLongDate(i.dueDate)}\n\nOpen in DueOra: ${i.url}`,
  };
}

export function digestEmail(opts: {
  to: string;
  name: string;
  orgName: string;
  logoUrl?: string | null;
  items: ReminderEmailItem[];
  appUrl: string;
}): EmailMessage {
  const first = opts.name.trim().split(/\s+/)[0] ?? opts.name;
  const n = opts.items.length;
  return {
    to: opts.to,
    tag: 'digest',
    subject: `🔔 ${n} payments need attention this week`,
    html: renderLayout({
      preheader: opts.items.map((i) => i.label).slice(0, 4).join(', '),
      heading: `${n} payments need attention`,
      logoUrl: opts.logoUrl,
      bodyHtml: `<p style="margin:0 0 12px">Hi ${esc(first)}, here's what's coming up for ${esc(opts.orgName)}:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${opts.items.map(itemRow).join('')}</table>`,
      button: { label: 'Open in DueOra', url: opts.appUrl },
      footerNote: 'We group reminders like this so your inbox stays calm. Turn digests off in Settings → Notifications.',
    }),
    text: `Hi ${first}, ${n} payments need attention at ${opts.orgName}:\n\n${opts.items
      .map((i) => `• ${i.label} — ${formatMoney(i.amountMinor, i.currency)}, due ${formatLongDate(i.dueDate)}`)
      .join('\n')}\n\nOpen DueOra: ${opts.appUrl}`,
  };
}

export function paymentRecordedEmail(opts: { to: string; orgName: string; logoUrl?: string | null; title: string; body: string; url: string }): EmailMessage {
  return {
    to: opts.to,
    tag: 'payment-recorded',
    subject: opts.body,
    html: renderLayout({ preheader: opts.body, heading: opts.title, logoUrl: opts.logoUrl, bodyHtml: `<p style="margin:0">${esc(opts.body)}</p>`, button: { label: 'Open in DueOra', url: opts.url } }),
    text: `${opts.body}\n\nOpen in DueOra: ${opts.url}`,
  };
}
