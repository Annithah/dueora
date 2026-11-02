import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { spacing, useTheme } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Fixed header rendered above the scrolling content (e.g. TopBar). */
  header?: ReactNode;
  /** Fixed footer (e.g. sticky actions). */
  footer?: ReactNode;
  /** Apply horizontal screen padding (default true). */
  padded?: boolean;
  /** Which safe-area edges to pad. Tabs screens skip the bottom (the tab bar handles it). */
  edges?: Edge[];
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Background override (e.g. teal splash). */
  background?: string;
}

export function Screen({
  children,
  scroll = true,
  header,
  footer,
  padded = true,
  edges = ['top', 'bottom'],
  refreshControl,
  contentStyle,
  background,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') && !header ? insets.top : 0,
    paddingBottom: edges.includes('bottom') && !footer ? insets.bottom : 0,
  };
  const inner: StyleProp<ViewStyle> = [
    { paddingHorizontal: padded ? spacing.screen : 0, paddingVertical: spacing.md, gap: 22 },
    contentStyle,
  ];

  return (
    <View style={[{ flex: 1, backgroundColor: background ?? colors.canvas }, pad]}>
      {header ? (
        <View
          style={{
            paddingTop: edges.includes('top') ? insets.top : 0,
            backgroundColor: colors.surface,
          }}
        >
          {header}
        </View>
      ) : null}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[inner, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: spacing.screen,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 16),
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
