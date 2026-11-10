import * as Updates from 'expo-updates';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react-native';
import { Linking, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Card, ListItem, Logo, Text } from '@/components/ui';
import { APP_VERSION } from '@/features/account/api';
import { LEGAL_URLS } from '@/lib/legal';
import { useTheme } from '@/theme';

/** Settings → About: version, the update channel, and the Privacy Policy and Terms. */
export default function About() {
  const { colors } = useTheme();
  const update = Updates.updateId ? Updates.updateId.slice(0, 8) : null;
  return (
    <Screen header={<TopBar title="About DueOra" />} contentStyle={{ gap: 18 }}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
        <Logo size={44} />
        <Text variant="bodyStrong">Your dues, on time.</Text>
        <Text variant="small" tone="muted">
          Version {APP_VERSION}
          {Updates.channel ? ` · ${Updates.channel}` : ''}
          {update ? ` · update ${update}` : ''}
        </Text>
      </View>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListItem
          icon={<ShieldCheck size={19} color={colors.primaryStrong} />}
          title="Privacy Policy"
          trailing={<ExternalLink size={16} color={colors.muted} />}
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        />
        <ListItem
          divider
          icon={<FileText size={19} color={colors.primaryStrong} />}
          title="Terms of Use"
          trailing={<ExternalLink size={16} color={colors.muted} />}
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        />
      </Card>
      <Text variant="caption" tone="muted" align="center">
        Made with care for organisations and people who pay on time. 💚
      </Text>
    </Screen>
  );
}
