import { CircleAlert, CircleCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { radius, useTheme } from '@/theme';

import { Text } from './Text';

/** Inline form-level message (server error or confirmation). Announced to screen readers. */
export function FormMessage({
  message,
  tone = 'error',
}: {
  message?: string | null;
  tone?: 'error' | 'success';
}) {
  const { colors } = useTheme();
  if (!message) return null;
  const fg = tone === 'error' ? colors.red : colors.green;
  const bg = tone === 'error' ? colors.redSoft : colors.greenSoft;
  const Icon = tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={{
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        padding: 12,
        borderRadius: radius.sm,
        backgroundColor: bg,
      }}
    >
      <Icon size={18} color={fg} />
      <Text variant="smallStrong" color={fg} style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}
