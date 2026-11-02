import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Right-hand link text, e.g. "View all" or "3 items". */
  action?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, onAction }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 32,
        marginBottom: 8,
      }}
    >
      <Text variant="section" accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityRole={onAction ? 'button' : 'text'}
          disabled={!onAction}
          onPress={onAction}
          hitSlop={8}
          style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 }}
        >
          <Text variant="smallStrong" tone="primary">
            {action}
          </Text>
          {onAction ? <ChevronRight size={16} color={colors.primaryStrong} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}
