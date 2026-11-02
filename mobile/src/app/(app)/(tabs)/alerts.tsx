import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';

export default function AlertsTab() {
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="Keep watch" title="Alerts" />
      <PlannedScreen title="Alerts" illustration="all-caught-up" />
    </Screen>
  );
}
