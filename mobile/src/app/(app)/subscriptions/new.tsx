import { router } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState, toast } from '@/components/ui';
import { permissionState } from '@/features/notifications/push';
import { SubscriptionForm, afterSave } from '@/features/subscriptions/SubscriptionForm';
import { usePermissions, useWorkspaceToday } from '@/features/workspaces/api';

export default function NewSubscription() {
  const today = useWorkspaceToday();
  const can = usePermissions();
  if (!can.manageSubscriptions) {
    return (
      <Screen header={<TopBar title="Add subscription" />}>
        <EmptyState
          illustration="team"
          title="You have view-only access"
          message="Ask an admin or finance member to add subscriptions in this workspace."
          actionLabel="Go back"
          actionVariant="secondary"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }
  return (
    <SubscriptionForm
      today={today}
      onSaved={async (saved, isFirst) => {
        toast.success('Subscription added 🎉', `We’ll keep watch on ${saved.name}.`);
        afterSave(saved, isFirst, await permissionState().catch(() => 'denied' as const));
      }}
    />
  );
}
