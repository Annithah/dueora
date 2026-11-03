import * as Clipboard from 'expo-clipboard';
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ApiError } from '@/api';
import { Card, IconButton, Text, toast } from '@/components/ui';
import { useRevealKey, type MaskedKey } from '@/features/subscriptions/api';
import { useTheme } from '@/theme';

export interface SubscriptionKeyCardProps {
  subscriptionId: string;
  value: MaskedKey;
  /** ADMIN and FINANCE may reveal and copy the plain key; VIEWER only sees the masked value. */
  canReveal: boolean;
}

/** How long a revealed key stays on screen before it is masked again. */
const HIDE_AFTER_MS = 30_000;

/** Shows "••••••4F7A" with Show (eye) and Copy buttons. The plain key never enters the query cache. */
export function SubscriptionKeyCard({ subscriptionId, value, canReveal }: SubscriptionKeyCardProps) {
  const { colors } = useTheme();
  const reveal = useRevealKey();
  const [plain, setPlain] = useState<string | null>(null);

  useEffect(() => {
    if (!plain) return;
    const t = setTimeout(() => setPlain(null), HIDE_AFTER_MS);
    return () => clearTimeout(t);
  }, [plain]);

  const fetchPlain = async (): Promise<string | null> => {
    if (plain) return plain;
    try {
      const res = await reveal.mutateAsync(subscriptionId);
      return res.value;
    } catch (err) {
      toast.error('Could not show the key', err instanceof ApiError ? err.message : undefined);
      return null;
    }
  };

  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <KeyRound size={19} color={colors.primaryStrong} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" tone="muted">
          Subscription key
        </Text>
        <Text variant="bodyStrong" selectable={!!plain} numberOfLines={2} accessibilityLabel={plain ? `Key ${plain}` : `Key ending in ${value.last4}`}>
          {plain ?? value.masked}
        </Text>
        {!canReveal ? (
          <Text variant="caption" tone="muted">
            Only admins and finance can view the full key
          </Text>
        ) : null}
      </View>
      {canReveal ? (
        <>
          {reveal.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <IconButton
              accessibilityLabel={plain ? 'Hide key' : 'Show key'}
              onPress={async () => {
                if (plain) setPlain(null);
                else setPlain(await fetchPlain());
              }}
            >
              {plain ? <EyeOff size={19} color={colors.ink} /> : <Eye size={19} color={colors.ink} />}
            </IconButton>
          )}
          <IconButton
            accessibilityLabel="Copy key"
            onPress={async () => {
              const key = await fetchPlain();
              if (!key) return;
              await Clipboard.setStringAsync(key);
              toast.success('Key copied');
            }}
          >
            <Copy size={19} color={colors.ink} />
          </IconButton>
        </>
      ) : null}
    </Card>
  );
}
