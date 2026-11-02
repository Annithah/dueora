import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';

export default function ResetPassword() {
  return (
    <Screen header={<TopBar />}>
      <PlannedScreen title="Choose a new password" />
    </Screen>
  );
}
