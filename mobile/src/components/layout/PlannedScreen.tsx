import { EmptyState } from '@/components/ui';

import type { IllustrationName } from '@/components/illustrations/Illustration';

/** Temporary body for routes whose real UI lands in a later build phase. */
export function PlannedScreen({
  title,
  illustration = 'empty-payments',
}: {
  title: string;
  illustration?: IllustrationName;
}) {
  return (
    <EmptyState
      illustration={illustration}
      title={title}
      message="This screen is being built."
      compact
    />
  );
}
