/**
 * Category SUGGESTIONS offered when a company is created or a category is added
 * (Finalize brief, Part 3). Nothing here is inserted on its own: a company starts empty,
 * with the suggestions it picks, or with a copy of another company's categories.
 * Icon keys match mobile/src/theme/categories.ts. Edit this list freely.
 */
export interface CategorySuggestion {
  name: string;
  icon: string;
  color: string;
  /** Optional sub-category suggestions (one level). */
  children?: readonly string[];
}

export const CATEGORY_SUGGESTIONS: readonly CategorySuggestion[] = [
  { name: 'Technology & software', icon: 'cpu', color: '#147070', children: ['Software & subscriptions', 'Cloud services'] },
  { name: 'Hosting & domains', icon: 'server', color: '#0F5C5C', children: ['Hosting', 'Domains'] },
  { name: 'Communication & internet', icon: 'wifi', color: '#6D36CC', children: ['Internet', 'Phone'] },
  { name: 'Social media', icon: 'share', color: '#C2410C' },
  { name: 'Office & rent', icon: 'house', color: '#A35900', children: ['Rent', 'Cleaning'] },
  { name: 'Insurance', icon: 'shield', color: '#157A53' },
  { name: 'Marketing', icon: 'megaphone', color: '#BE185D' },
  { name: 'Utilities', icon: 'bulb', color: '#2469CF', children: ['Electricity', 'Water'] },
  { name: 'Transport', icon: 'car', color: '#0E7490' },
  { name: 'Education & training', icon: 'graduation', color: '#7C3AED' },
  { name: 'Taxes & fees', icon: 'money', color: '#475569' },
  { name: 'Salaries & contractors', icon: 'building', color: '#0F766E' },
  { name: 'Other', icon: 'tag', color: '#667373' },
];

/** Style used when a category is created without one (e.g. by an import). */
export const DEFAULT_CATEGORY_STYLE = { icon: 'tag', color: '#667373' } as const;
