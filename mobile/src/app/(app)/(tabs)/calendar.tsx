import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';

export default function CalendarTab() {
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="Plan ahead" title="Calendar" />
      <PlannedScreen title="Calendar" illustration="empty-calendar" />
    </Screen>
  );
}
