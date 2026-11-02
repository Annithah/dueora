import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';

export default function MoreTab() {
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="Workspace" title="More" />
      <PlannedScreen title="More" illustration="team" />
    </Screen>
  );
}
