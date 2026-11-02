import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { fontFamily, radius, useTheme } from '@/theme';

import { Text } from './Text';

export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * One-time-code boxes backed by a single hidden input, so paste and SMS/email
 * autofill ("textContentType=oneTimeCode") work naturally.
 */
export function CodeInput({
  value,
  onChange,
  length = 6,
  error,
  autoFocus = true,
}: CodeInputProps) {
  const { colors } = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const digits = value.split('');

  return (
    <Pressable accessible={false} onPress={() => input.current?.focus()}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {Array.from({ length }, (_, i) => {
          const active = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={{
                flex: 1,
                aspectRatio: 1,
                maxHeight: 60,
                borderRadius: radius.sm,
                borderWidth: active ? 2 : 1,
                borderColor: error ? colors.red : active ? colors.primaryStrong : colors.line,
                backgroundColor: colors.surface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 22 }} allowFontScaling={false}>
                {digits[i] ?? ''}
              </Text>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus={autoFocus}
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={`${length}-digit code`}
        style={{ position: 'absolute', opacity: 0.01, width: '100%', height: '100%' }}
      />
    </Pressable>
  );
}
