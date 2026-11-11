import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { Mail, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, FormMessage, Input, Logo, PasswordInput, Text } from '@/components/ui';
import { useRegister } from '@/features/auth/api';
import { signupSchema, type SignupValues } from '@/features/auth/schemas';
import { applyApiError } from '@/lib/forms';
import { useTheme } from '@/theme';

export default function Signup() {
  const { colors } = useTheme();
  const registerUser = useRegister();
  const [formError, setFormError] = useState<string | null>(null);
  const { control, handleSubmit, setError, formState } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync(values);
      // Signed in now; the app layout routes to workspace setup next.
      router.replace('/');
    } catch (err) {
      setFormError(applyApiError(err, setError, ['name', 'email', 'password']));
    }
  });

  return (
    <Screen header={<TopBar onBack={() => router.replace('/welcome')} />}>
      <View style={{ gap: 18, paddingTop: 10 }}>
        <Logo size={36} />
        <View style={{ gap: 6 }}>
          <Text variant="display" accessibilityRole="header">
            Create your account
          </Text>
          <Text variant="body" tone="muted">
            Start tracking your recurring bills in minutes.
          </Text>
        </View>

        <FormMessage message={formError} />

        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <Input
              label="Full name"
              placeholder="Your full name"
              icon={<UserRound size={18} color={colors.muted} />}
              autoComplete="name"
              textContentType="name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
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
          Create account
        </Button>

        <Link href="/login" replace asChild>
          <Pressable
            accessibilityRole="link"
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text variant="small" tone="muted">
              Already have an account?{' '}
              <Text variant="smallStrong" tone="primary">
                Log in
              </Text>
            </Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}
