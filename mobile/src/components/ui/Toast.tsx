import { Bell, CircleAlert, CircleCheck, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { elevation, radius, useTheme, type ColorScheme } from '@/theme';

import { Text } from './Text';
import { useToastStore, type ToastMessage, type ToastTone } from './toastStore';

function toneStyle(tone: ToastTone, colors: ColorScheme, scheme: 'light' | 'dark') {
  switch (tone) {
    case 'success':
      // Solid green banner in light mode (as in the prototype); soft tint in dark mode.
      return scheme === 'light'
        ? { bg: colors.green, fg: '#FFFFFF', Icon: CircleCheck }
        : { bg: colors.greenSoft, fg: colors.green, Icon: CircleCheck };
    case 'error':
      return { bg: colors.redSoft, fg: colors.red, Icon: CircleAlert };
    case 'warning':
      return { bg: colors.amberTextSoft, fg: colors.amberText, Icon: CircleAlert };
    case 'info':
      return { bg: colors.surfaceRaised, fg: colors.ink, Icon: Bell };
  }
}

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { colors, scheme } = useTheme();
  const dismiss = useToastStore((s) => s.dismiss);
  const { bg, fg, Icon } = toneStyle(toast.tone, colors, scheme);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismiss]);

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(18)}
      exiting={FadeOutUp}
      layout={LinearTransition}
    >
      <Pressable
        accessibilityRole={toast.onPress ? 'button' : 'alert'}
        accessibilityLiveRegion="polite"
        onPress={() => {
          toast.onPress?.();
          dismiss(toast.id);
        }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radius.md,
          backgroundColor: bg,
          borderWidth: toast.tone === 'info' ? 1 : 0,
          borderColor: colors.line,
          shadowColor: colors.shadow,
          ...elevation.raised,
        }}
      >
        <Icon size={18} color={fg} />
        <View style={{ flex: 1 }}>
          <Text variant="smallStrong" color={fg}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text variant="small" color={fg} style={{ opacity: 0.9 }}>
              {toast.message}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel="Dismiss"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => dismiss(toast.id)}
        >
          <X size={16} color={fg} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

/** Mount once near the root; shows toasts from `toast.show()` at the top of the screen. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        gap: 8,
        zIndex: 1000,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}
