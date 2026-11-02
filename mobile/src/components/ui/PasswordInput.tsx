import { Eye, EyeOff, LockKeyhole } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { useTheme } from '@/theme';

import { Input, type InputProps } from './Input';

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<InputProps, 'secureTextEntry' | 'icon' | 'trailing'>) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <Input
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      autoComplete="password"
      {...props}
      secureTextEntry={!visible}
      icon={<LockKeyhole size={18} color={colors.muted} />}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={12}
          onPress={() => setVisible((v) => !v)}
        >
          {visible ? (
            <EyeOff size={18} color={colors.muted} />
          ) : (
            <Eye size={18} color={colors.muted} />
          )}
        </Pressable>
      }
    />
  );
}
