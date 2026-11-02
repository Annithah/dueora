import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/api';

/**
 * Show an API error on the form: field-level validation details go to their fields,
 * anything else becomes a form-wide message (returned for display).
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      let matched = false;
      for (const d of err.details as { path?: string; message?: string }[]) {
        const field = fields.find((f) => f === d.path);
        if (field) {
          setError(field, { type: 'server', message: d.message ?? 'Invalid value' });
          matched = true;
        }
      }
      if (matched) return null;
    }
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
