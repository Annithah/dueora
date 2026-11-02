import { View } from 'react-native';

import { Illustration, type IllustrationName } from '@/components/illustrations/Illustration';

import { Button, type ButtonVariant } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  illustration: IllustrationName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionVariant?: ButtonVariant;
  /** Smaller layout for use inside cards. */
  compact?: boolean;
}

/** Illustrated empty / error state — every list uses one. */
export function EmptyState({
  illustration,
  title,
  message,
  actionLabel,
  onAction,
  actionVariant = 'primary',
  compact = false,
}: EmptyStateProps) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: compact ? 16 : 32,
        paddingHorizontal: 20,
        gap: 6,
      }}
    >
      <Illustration name={illustration} size={compact ? 130 : 165} />
      <Text variant="section" align="center" accessibilityRole="header" style={{ marginTop: 8 }}>
        {title}
      </Text>
      {message ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 280 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button variant={actionVariant} onPress={onAction} style={{ marginTop: 12 }}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
