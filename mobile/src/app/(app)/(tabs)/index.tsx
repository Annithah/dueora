import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';

export default function HomeTab() {
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="Good morning" title="Your dashboard" />
      <PlannedScreen title="Your dashboard" illustration="track" />
    </Screen>
  );
}
