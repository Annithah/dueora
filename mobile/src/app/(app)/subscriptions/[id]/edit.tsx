import { router, useLocalSearchParams } from 'expo-router';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui';
import { useObligation } from '@/features/obligations/api';
import { ObligationForm } from '@/features/obligations/ObligationForm';
import { toISODate } from '@/lib/dates';

export default function EditPayment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useObligation(id);
  if (!query.data) {
    return (
      <Screen header={<TopBar title="Edit payment" />}>
        <QueryState query={query}>{() => null}</QueryState>
      </Screen>
    );
  }
  return (
    <ObligationForm
      existing={query.data}
      today={toISODate(new Date())}
      onSaved={() => {
        toast.success('Changes saved');
        router.back();
      }}
    />
  );
}
