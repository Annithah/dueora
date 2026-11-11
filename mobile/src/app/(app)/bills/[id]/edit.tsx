import { router, useLocalSearchParams } from 'expo-router';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { toast } from '@/components/ui';
import { useBill } from '@/features/bills/api';
import { BillForm } from '@/features/bills/BillForm';
import { useWorkspaceToday } from '@/features/workspaces/api';

export default function EditBill() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useBill(id);
  const today = useWorkspaceToday();
  if (!query.data) {
    return (
      <Screen header={<TopBar title="Edit bill" />}>
        <QueryState query={query}>{() => null}</QueryState>
      </Screen>
    );
  }
  return (
    <BillForm
      existing={query.data}
      today={today}
      onSaved={() => {
        toast.success('Changes saved');
        router.back();
      }}
    />
  );
}
