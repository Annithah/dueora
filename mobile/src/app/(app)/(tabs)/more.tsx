import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react-native';

import { PageHeader } from '@/components/layout/PageHeader';
import { PlannedScreen } from '@/components/layout/PlannedScreen';
import { Screen } from '@/components/layout/Screen';
import { Card, ListItem } from '@/components/ui';
import { signOut } from '@/features/auth/api';
import { useTheme } from '@/theme';

export default function MoreTab() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  return (
    <Screen edges={['top']}>
      <PageHeader eyebrow="Workspace" title="More" />
      <PlannedScreen title="More" illustration="team" />
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListItem
          title="Log out"
          destructive
          icon={<LogOut size={19} color={colors.red} />}
          onPress={() => void signOut(queryClient)}
        />
      </Card>
    </Screen>
  );
}
