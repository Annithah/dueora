import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';

export default function Signup() {
  return (
    <Screen header={<TopBar />}>
      <PlannedScreen title="Create your account" />
    </Screen>
  );
}
