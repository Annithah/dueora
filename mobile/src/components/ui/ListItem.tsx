import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Leading element; pass `icon` for the standard soft teal tile. */
  leading?: ReactNode;
  icon?: ReactNode;
  /** Trailing element; defaults to a chevron when `onPress` is set. */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  /** Draw a hairline above (for rows after the first inside a Card). */
  divider?: boolean;
  accessibilityHint?: string;
}

export function ListItem({
  title,
  subtitle,
  leading,
  icon,
  trailing,
  onPress,
  destructive,
  divider,
  accessibilityHint,
}: ListItemProps) {
  const { colors } = useTheme();
  const content = (
    <>
      {leading ??
        (icon ? (
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 11,
              backgroundColor: colors.primarySoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </View>
        ) : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" tone={destructive ? 'danger' : 'ink'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ??
        (onPress && !destructive ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </>
  );

  const rowStyle = {
    minHeight: 64,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: divider ? 1 : 0,
    borderTopColor: colors.line,
  };

  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && { backgroundColor: colors.primarySoft }]}
    >
      {content}
    </Pressable>
  );
}
