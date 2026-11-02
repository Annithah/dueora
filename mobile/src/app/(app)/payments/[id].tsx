import { useLocalSearchParams } from 'expo-router';

import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';

/** Deep-link target for notifications (dueora://payments/:id). Full detail UI arrives in Phase 7. */
export default function PaymentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen header={<TopBar title="Payment detail" />}>
      <PlannedScreen title={`Payment ${id ?? ''}`.trim()} />
    </Screen>
  );
}
