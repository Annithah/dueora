import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface TopBarProps {
  title?: string;
  /** Right-hand element (text button or IconButton). */
  action?: ReactNode;
  onBack?: () => void;
  /** Hide the back button (root of a flow). */
  hideBack?: boolean;
}

/** Prototype top bar: back arrow, centred title, optional action; hairline underneath. */
export function TopBar({ title, action, onBack, hideBack }: TopBarProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ width: 72, alignItems: 'flex-start' }}>
        {hideBack ? null : (
          <IconButton
            accessibilityLabel="Go back"
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          >
            <ArrowLeft size={22} color={colors.ink} />
          </IconButton>
        )}
      </View>
      <Text
        variant="bodyStrong"
        align="center"
        numberOfLines={1}
        accessibilityRole="header"
        style={{ flex: 1 }}
      >
        {title ?? ''}
      </Text>
      <View style={{ width: 72, alignItems: 'flex-end' }}>{action}</View>
    </View>
  );
}
