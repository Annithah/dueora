import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Button, CodeInput, FormMessage, Text, toast } from '@/components/ui';
import { signOut, useMe, useResendVerification, useVerifyEmail } from '@/features/auth/api';
import { ApiError } from '@/api';
import { useTheme } from '@/theme';

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const submit = async (value = code) => {
    if (value.length !== 6) return;
    setError(null);
    try {
      await verify.mutateAsync(value);
      router.replace('/setup/workspace');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setCode('');
    }
  };

  return (
    <Screen header={<TopBar onBack={() => void signOut(queryClient)} />}>
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
          <Mail size={28} color={colors.primaryStrong} />
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="display" accessibilityRole="header">
            Check your email
          </Text>
          <Text variant="body" tone="muted">
            We sent a 6-digit verification code to{' '}
            <Text variant="bodyStrong">{me.data?.email}</Text>.
          </Text>
        </View>
        <FormMessage message={error} />
        <CodeInput
          value={code}
          error={!!error}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) void submit(v);
          }}
        />
        <Button
          full
          size="lg"
          loading={verify.isPending}
          disabled={code.length !== 6}
          onPress={() => void submit()}
        >
          Verify email
        </Button>
        <Pressable
          accessibilityRole="button"
          disabled={seconds > 0 || resend.isPending}
          onPress={() =>
            resend.mutate(undefined, {
              onSuccess: () => {
                setSeconds(RESEND_SECONDS);
                toast.info('New code sent', 'Check your inbox (and spam folder).');
              },
              onError: (err) =>
                setError(err instanceof ApiError ? err.message : 'Could not send a new code'),
            })
          }
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text variant="small" tone="muted">
            Didn&apos;t receive it?{' '}
            <Text variant="smallStrong" tone={seconds > 0 ? 'muted' : 'primary'}>
              {seconds > 0 ? `Resend in 0:${String(seconds).padStart(2, '0')}` : 'Resend code'}
            </Text>
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
