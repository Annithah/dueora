import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';

export default function NewPayment() {
  return (
    <Screen header={<TopBar title="Add payment" />}>
      <PlannedScreen title="Add payment" />
    </Screen>
  );
}
