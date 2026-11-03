import { router, useLocalSearchParams } from 'expo-router';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui';
import { useSubscription } from '@/features/subscriptions/api';
import { SubscriptionForm } from '@/features/subscriptions/SubscriptionForm';
import { useWorkspaceToday } from '@/features/workspaces/api';

export default function EditSubscription() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSubscription(id);
  const today = useWorkspaceToday();
  if (!query.data) {
    return (
      <Screen header={<TopBar title="Edit subscription" />}>
        <QueryState query={query}>{() => null}</QueryState>
      </Screen>
    );
  }
  return (
    <SubscriptionForm
      existing={query.data}
      today={today}
      onSaved={() => {
        toast.success('Changes saved');
        router.back();
      }}
    />
  );
}
