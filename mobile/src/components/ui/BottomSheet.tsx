import { X } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { motion, radius, useTheme } from '@/theme';

import { IconButton } from './IconButton';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Small line above the title (e.g. the obligation name). */
  eyebrow?: string;
  children: ReactNode;
  /** Max height as a fraction of the window (default 0.92). */
  maxHeightRatio?: number;
  /** Wrap children in a ScrollView (default true). */
  scrollable?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
  maxHeightRatio = 0.92,
  scrollable = true,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(
      withTiming(visible ? 1 : 0, {
        duration: reduceMotion ? 0 : motion.slow,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [visible, reduceMotion, progress]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * height }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const close = () => {
    progress.set(
      withTiming(0, { duration: reduceMotion ? 0 : motion.base }, (finished) => {
        if (finished) scheduleOnRN(onClose);
      }),
    );
  };

  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[{ flex: 1, backgroundColor: colors.scrim }, scrimStyle]}>
          <Pressable
            style={{ flex: 1 }}
            onPress={close}
            accessibilityLabel="Close sheet"
            accessibilityRole="button"
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: height * maxHeightRatio,
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
              paddingTop: 10,
              shadowColor: '#081919',
              shadowOpacity: 0.22,
              shadowRadius: 45,
              shadowOffset: { width: 0, height: -16 },
              elevation: 16,
            },
            sheetStyle,
          ]}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 42,
              height: 4,
              borderRadius: 4,
              backgroundColor: colors.switchOff,
            }}
          />
          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                {eyebrow ? (
                  <Text variant="small" tone="muted">
                    {eyebrow}
                  </Text>
                ) : null}
                <Text variant="section" accessibilityRole="header">
                  {title}
                </Text>
              </View>
              <IconButton accessibilityLabel="Close" onPress={close}>
                <X size={20} color={colors.ink} />
              </IconButton>
            </View>
          ) : null}
          <Body
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              scrollable ? { padding: 20, paddingBottom: 24 + insets.bottom, gap: 15 } : undefined
            }
            style={
              !scrollable ? { padding: 20, paddingBottom: 24 + insets.bottom, gap: 15 } : undefined
            }
          >
            {children}
          </Body>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
