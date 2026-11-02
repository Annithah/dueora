import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, FormMessage, Input, Logo, Text } from '@/components/ui';
import { useForgotPassword } from '@/features/auth/api';
import { forgotSchema, type ForgotValues } from '@/features/auth/schemas';
import { applyApiError } from '@/lib/forms';
import { useTheme } from '@/theme';

export default function ForgotPassword() {
  const { colors } = useTheme();
  const forgot = useForgotPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await forgot.mutateAsync(email);
      router.push({ pathname: '/reset-password', params: { email } });
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email']));
    }
  });

  return (
    <Screen header={<TopBar />}>
      <View style={{ gap: 18, paddingTop: 10 }}>
        <Logo size={36} />
        <View style={{ gap: 6 }}>
          <Text variant="display" accessibilityRole="header">
            Reset your password
          </Text>
          <Text variant="body" tone="muted">
            Enter your email and we&apos;ll send you a 6-digit reset code.
          </Text>
        </View>
        <FormMessage message={formError} />
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <Input
              label="Work email"
              placeholder="you@company.com"
              icon={<Mail size={18} color={colors.muted} />}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Button full size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          Send reset code
        </Button>
      </View>
    </Screen>
  );
}
