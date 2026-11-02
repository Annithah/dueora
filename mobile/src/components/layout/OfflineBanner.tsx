import NetInfo from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { radius, useTheme } from '@/theme';

export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((s) =>
        setOffline(s.isConnected === false || s.isInternetReachable === false),
      ),
    [],
  );
  return offline;
}

/** "You're offline. Showing your latest data." — cached data stays readable. */
export function OfflineBanner({
  message = "You're offline. Showing your latest data.",
}: {
  message?: string;
}) {
  const { colors } = useTheme();
  const offline = useIsOffline();
  if (!offline) return null;
  return (
    <Animated.View entering={FadeInUp} exiting={FadeOutUp}>
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 44,
          paddingHorizontal: 12,
          borderRadius: radius.sm,
          backgroundColor: colors.amberTextSoft,
        }}
      >
        <WifiOff size={17} color={colors.amberText} />
        <Text variant="smallStrong" color={colors.amberText} style={{ flex: 1 }}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
