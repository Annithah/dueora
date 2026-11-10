/**
 * Public Privacy Policy and Terms (GitHub Pages from docs/legal/ in Annithah/dueora).
 * Overridable per build with EXPO_PUBLIC_PRIVACY_URL / EXPO_PUBLIC_TERMS_URL.
 */
const BASE = 'https://annithah.github.io/dueora/legal';

export const LEGAL_URLS = {
  privacy: process.env.EXPO_PUBLIC_PRIVACY_URL || `${BASE}/privacy.html`,
  terms: process.env.EXPO_PUBLIC_TERMS_URL || `${BASE}/terms.html`,
} as const;
