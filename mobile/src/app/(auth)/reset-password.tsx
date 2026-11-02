import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, CodeInput, FormMessage, PasswordInput, Text, toast } from '@/components/ui';
import { useForgotPassword, useResetPassword } from '@/features/auth/api';
import { resetSchema, type ResetValues } from '@/features/auth/schemas';
import { applyApiError } from '@/lib/forms';
import { useTheme } from '@/theme';

export default function ResetPassword() {
  const { colors } = useTheme();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const reset = useResetPassword();
  const resend = useForgotPassword();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await reset.mutateAsync({ email, ...values });
      toast.success('Password updated', 'Log in with your new password.');
      router.replace('/login');
    } catch (err) {
      setFormError(applyApiError(err, setError, ['code', 'newPassword']));
    }
  });

  return (
    <Screen header={<TopBar />}>
      <View style={{ gap: 18, paddingTop: 10 }}>
        <View
          style={{
            width: 62,
            height: 62,
            borderRadius: 20,
            backgroundColor: colors.primarySoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <KeyRound size={28} color={colors.primaryStrong} />
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="display" accessibilityRole="header">
            Choose a new password
          </Text>
          <Text variant="body" tone="muted">
            If an account exists for <Text variant="bodyStrong">{email}</Text>, we sent it a 6-digit
            code.
          </Text>
        </View>
        <FormMessage message={formError} />
        <Controller
          control={control}
          name="code"
          render={({ field, fieldState }) => (
            <View style={{ gap: 6 }}>
              <CodeInput value={field.value} onChange={field.onChange} error={!!fieldState.error} />
              {fieldState.error ? (
                <Text variant="small" tone="danger">
                  {fieldState.error.message}
                </Text>
              ) : null}
            </View>
          )}
        />
        <Controller
          control={control}
          name="newPassword"
          render={({ field, fieldState }) => (
            <PasswordInput
              label="New password"
              placeholder="At least 8 characters"
              textContentType="newPassword"
              autoComplete="new-password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Button full size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          Update password
        </Button>
        <Button
          variant="ghost"
          loading={resend.isPending}
          onPress={() =>
            resend.mutate(email, { onSuccess: () => toast.info('Code sent', 'Check your inbox.') })
          }
        >
          Send a new code
        </Button>
      </View>
    </Screen>
  );
}
