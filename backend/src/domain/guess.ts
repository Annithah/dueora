/**
 * Offline guesses for spreadsheet import and smart forms (pure, no I/O).
 * DueOra AI can do better when it's on; these keep import working without it.
 * Guesses are always shown to the user as editable suggestions, never applied silently.
 */
import type { FrequencyUnit } from './schedule.js';

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  // Product names that contain other categories' words ("Office 365" isn't rent).
  ['Technology & software', /\b(office ?365|microsoft 365|zoom|slack|notion|quickbooks)\b/i],
  ['Hosting & domains', /\b(host(ing)?|domain|dns|server|vps|cloud|cdn|ssl|cert(ificate)?|web ?site)\b/i],
  ['Communication & internet', /\b(internet|wi-?fi|fib(re|er)|broadband|isp|phone|mobile|sim|airtime|data bundle|telecom|voip|sms)\b/i],
  ['Social media', /\b(facebook|instagram|tiktok|twitter|linkedin|youtube|meta ads|social)\b/i],
  ['Office & rent', /\b(rent|office|lease|cowork(ing)?|desk|premises|furniture)\b/i],
  ['Insurance', /\b(insurance|assurance|cover(age)?|policy|medical scheme)\b/i],
  ['Marketing', /\b(marketing|ads?|advertis\w*|campaign|seo|newsletter|mailchimp|promo\w*)\b/i],
  ['Utilities', /\b(electric\w*|power|water|gas|utilit\w*|waste|garbage|security guard)\b/i],
  ['Transport', /\b(transport|fuel|petrol|diesel|car|vehicle|taxi|bus|parking|fleet|delivery)\b/i],
  ['Education & training', /\b(school|tuition|course|training|education|class|university|exam|books?|learning)\b/i],
  ['Technology & software', /\b(software|licen[cs]e|saas|app|bill|office ?365|microsoft|adobe|antivirus|it support|api|crm|erp|accounting)\b/i],
];

/** Best-matching default category name for a free-text bill name/provider, or null. */
export function guessCategoryName(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  for (const [name, re] of CATEGORY_KEYWORDS) if (re.test(t)) return name;
  return null;
}

export interface FrequencyGuess {
  unit: FrequencyUnit;
  interval: number;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, six: 6, twelve: 12 };

/** "monthly", "every 2 weeks", "quarterly", "annual", "one-time", "3 months"… → unit + interval. */
export function parseFrequency(raw: string): FrequencyGuess | null {
  const t = raw.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  if (!t) return null;
  const table: [RegExp, FrequencyGuess][] = [
    [/^(one ?time|once|single|one off|lifetime)$/, { unit: 'ONCE', interval: 1 }],
    [/^(weekly|every week|week|hebdomadaire)$/, { unit: 'WEEK', interval: 1 }],
    [/^(bi ?weekly|fortnightly|every 2 weeks|every two weeks)$/, { unit: 'WEEK', interval: 2 }],
    [/^(monthly|every month|month|mensuel)$/, { unit: 'MONTH', interval: 1 }],
    [/^(bi ?monthly|every 2 months|every two months)$/, { unit: 'MONTH', interval: 2 }],
    [/^(quarterly|every quarter|every 3 months|every three months|trimestriel)$/, { unit: 'MONTH', interval: 3 }],
    [/^(semi ?annual(ly)?|half ?yearly|bi ?annual(ly)?|every 6 months|every six months)$/, { unit: 'MONTH', interval: 6 }],
    [/^(yearly|annual(ly)?|every year|year|per year|annuel)$/, { unit: 'YEAR', interval: 1 }],
  ];
  for (const [re, g] of table) if (re.test(t)) return g;
  const m = /^(?:every )?(\d+|one|two|three|four|six|twelve) (day|week|month|year)s?$/.exec(t);
  if (m) {
    const n = Number(m[1]) || NUMBER_WORDS[m[1]!] || 0;
    if (n < 1 || n > 120) return null;
    const unit = m[2] === 'week' ? 'WEEK' : m[2] === 'month' ? 'MONTH' : m[2] === 'year' ? 'YEAR' : null;
    if (m[2] === 'day' && n % 7 === 0) return { unit: 'WEEK', interval: n / 7 };
    return unit ? { unit, interval: n } : null;
  }
  return null;
}

/** "$1,234.50", "1234", "1 234,50", "USD 40" → integer cents. Null when not a positive amount. */
export function parseAmountCents(raw: string | number): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) : null;
  let t = raw.trim().replace(/usd|us\$|\$/gi, '').replace(/\s/g, '');
  if (!t) return null;
  // "1.234,50" or "1234,50" (comma decimals) → "1234.50"
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  t = t.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 ? cents : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function valid(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Spreadsheet dates → "YYYY-MM-DD". Accepts ISO, Excel date cells, "20 Oct 2026",
 * "Oct 20, 2026" and slashed dates. Slashed dates are read day-first (20/10/2026) unless
 * that's impossible (10/20/2026 → 20 Oct).
 */
export function parseDateCell(raw: string | number | Date): string | null {
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : valid(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30).
    if (raw < 20000 || raw > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(raw) * 86_400_000);
    return valid(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  const t = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    return a > 12 || b <= 12 ? valid(y, b, a) : valid(y, a, b);
  }
  m = /^(\d{1,2}) ([a-z]{3})[a-z]*\.?,? (\d{4})$/i.exec(t);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.toLowerCase());
    return mi >= 0 ? valid(Number(m[3]), mi + 1, Number(m[1])) : null;
  }
  m = /^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/i.exec(t);
  if (m) {
    const mi = MONTHS.indexOf(m[1]!.toLowerCase());
    return mi >= 0 ? valid(Number(m[3]), mi + 1, Number(m[2])) : null;
  }
  return null;
}
