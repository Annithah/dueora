/** Workspace default reminder offsets (days; negative = after the due date). */
export const DEFAULT_REMINDER_OFFSETS = [30, 14, 7, 3, 1, 0, -1, -3, -7] as const;

// Categories are no longer seeded: each company starts empty, with picked suggestions
// (src/config/categorySuggestions.ts) or with a copy of another company's categories.
