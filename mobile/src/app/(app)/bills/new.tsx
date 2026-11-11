import { router } from 'expo-router';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState, toast } from '@/components/ui';
import { permissionState } from '@/features/notifications/push';
import { BillForm, afterSave } from '@/features/bills/BillForm';
import { usePermissions, useWorkspaceToday } from '@/features/workspaces/api';

export default function NewBill() {
  const today = useWorkspaceToday();
  const can = usePermissions();
  if (!can.manageBills) {
    return (
      <Screen header={<TopBar title="Add bill" />}>
        <EmptyState
          illustration="team"
          title="You have view-only access"
          message="Ask an admin or finance member to add bills in this workspace."
          actionLabel="Go back"
          actionVariant="secondary"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }
  return (
    <BillForm
      today={today}
      onSaved={async (saved, isFirst) => {
        toast.success('Bill added 🎉', `We’ll keep watch on ${saved.name}.`);
        afterSave(saved, isFirst, await permissionState().catch(() => 'denied' as const));
      }}
    />
  );
}
