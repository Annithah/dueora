import type { ReactNode } from 'react';

import { ApiError } from '@/api';
import { EmptyState, SkeletonList } from '@/components/ui';

/**
 * Standard loading / error handling for a query. Cached data (including offline
 * data restored from storage) is always shown; errors only replace the screen when
 * there's nothing to show.
 */
export function QueryState<T>({
  query,
  children,
  loading,
}: {
  /** Any TanStack query result (regular or infinite). */
  query: { data: T | undefined; isError: boolean; error: unknown; refetch: () => unknown };
  children: (data: T) => ReactNode;
  loading?: ReactNode;
}) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    const offline = query.error instanceof ApiError && query.error.isNetworkError;
    return (
      <EmptyState
        illustration={offline ? 'offline' : 'error'}
        title={offline ? "You're offline" : 'Something went wrong'}
        message={
          offline
            ? "We'll show your subscriptions as soon as you're back online."
            : 'We couldn’t load this. Please try again.'
        }
        actionLabel="Try again"
        actionVariant="secondary"
        onAction={() => void query.refetch()}
      />
    );
  }
  return <>{loading ?? <SkeletonList rows={4} />}</>;
}
