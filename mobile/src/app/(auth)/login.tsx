import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, FormMessage, Input, Logo, PasswordInput, Text } from '@/components/ui';
import { useLogin } from '@/features/auth/api';
import { loginSchema, type LoginValues } from '@/features/auth/schemas';
import { applyApiError } from '@/lib/forms';
import { useTheme } from '@/theme';

export default function Login() {
  const { colors } = useTheme();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      router.replace('/');
    } catch (err) {
      setFormError(applyApiError(err, setError, ['email', 'password']));
    }
  });

  return (
    <Screen header={<TopBar onBack={() => router.replace('/onboarding')} />}>
      <View style={{ gap: 18, paddingTop: 10 }}>
        <Logo size={36} />
        <View style={{ gap: 6 }}>
          <Text variant="display" accessibilityRole="header">
            Welcome back
          </Text>
          <Text variant="body" tone="muted">
            Log in to keep every due date under control.
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
              textContentType="emailAddress"
              returnKeyType="next"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <PasswordInput
              label="Password"
              placeholder="At least 8 characters"
              returnKeyType="go"
              onSubmitEditing={() => void onSubmit()}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Link href="/forgot-password" asChild>
          <Pressable
            accessibilityRole="link"
            style={{
              alignSelf: 'flex-end',
              minHeight: 44,
              justifyContent: 'center',
              marginTop: -8,
            }}
          >
            <Text variant="smallStrong" tone="primary">
              Forgot password?
            </Text>
          </Pressable>
        </Link>

        <Button full size="lg" loading={formState.isSubmitting} onPress={() => void onSubmit()}>
          Log in
        </Button>

        <Link href="/signup" replace asChild>
          <Pressable
            accessibilityRole="link"
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="small" tone="muted">
              New to DueOra?{' '}
              <Text variant="smallStrong" tone="primary">
                Sign up
              </Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}
