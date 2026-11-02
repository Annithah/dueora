import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';

export default function PaymentsTab() {
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="All obligations" title="Payments" />
      <PlannedScreen title="Payments" illustration="empty-payments" />
    </Screen>
  );
}
