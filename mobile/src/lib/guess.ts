/**
 * Offline category suggestion while typing a bill name (mirrors
 * backend/src/domain/guess.ts). DueOra AI refines it when it's switched on.
 * Suggestions are only ever shown as a tappable chip, never applied silently.
 */
const CATEGORY_KEYWORDS: [string, RegExp][] = [
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
  ['Technology & software', /\b(software|licen[cs]e|saas|app|bill|microsoft|adobe|antivirus|it support|api|crm|erp|accounting)\b/i],
];

export function guessCategoryName(text: string): string | null {
  const t = text.trim();
  if (t.length < 3) return null;
  for (const [name, re] of CATEGORY_KEYWORDS) if (re.test(t)) return name;
  return null;
}
