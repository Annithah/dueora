import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { radius, typography, useTheme } from '@/theme';

import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  /** Leading icon element. */
  icon?: ReactNode;
  /** Trailing element (e.g. show/hide password). */
  trailing?: ReactNode;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function Input({
  label,
  icon,
  trailing,
  error,
  hint,
  containerStyle,
  multiline,
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.red : focused ? colors.primaryStrong : colors.line;

  return (
    <View style={[{ gap: 8 }, containerStyle]}>
      {label ? (
        <Text variant="label" nativeID={rest.nativeID ? `${rest.nativeID}-label` : undefined}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          minHeight: multiline ? 96 : 48,
          borderRadius: radius.input,
          borderWidth: 1,
          borderColor,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          // Focus halo from the prototype (3px teal-50 ring).
          shadowColor: colors.primaryStrong,
          shadowOpacity: focused && !error ? 0.18 : 0,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        {icon ? <View style={{ opacity: 0.85 }}>{icon}</View> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primaryStrong}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          maxFontSizeMultiplier={1.6}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            typography.body,
            { flex: 1, color: colors.ink, minHeight: multiline ? 72 : 46, paddingVertical: 0 },
            style,
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
