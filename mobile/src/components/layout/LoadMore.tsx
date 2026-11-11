import { ActivityIndicator, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { useTheme } from '@/theme';

export interface LoadMoreProps {
  shown: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  noun?: string;
}

/** Footer for server-paginated lists (10 per page): "Load more" or a quiet "that's all". */
export function LoadMore({ shown, total, hasMore, loading, onLoadMore, noun = 'bills' }: LoadMoreProps) {
  const { colors } = useTheme();
  if (total === 0) return null;
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <Text variant="small" tone="muted">
        Showing {shown} of {total} {noun}
      </Text>
      {hasMore ? (
        loading ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading more" />
        ) : (
          <Button variant="secondary" onPress={onLoadMore}>
            Load more
          </Button>
        )
      ) : null}
    </View>
  );
}
