import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Mail, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, BottomSheet, Button, Card, CodeInput, FormMessage, Input, Text, toast } from '@/components/ui';
import { ApiError, api } from '@/api';
import { useRequestEmailCode, useVerifyEmail } from '@/features/account/api';
import { meKey, useMe, type Me } from '@/features/auth/api';
import { useTheme } from '@/theme';

export default function Profile() {
  const me = useMe();
  if (!me.data) {
    return (
      <Screen header={<TopBar title="Profile" />}>
        <QueryState query={me}>{() => null}</QueryState>
      </Screen>
    );
  }
  return <ProfileForm me={me.data} />;
}

function ProfileForm({ me }: { me: Me }) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const requestCode = useRequestEmailCode();
  const verify = useVerifyEmail();

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.patch<Me>('/me', { name: name.trim() });
      queryClient.setQueryData(meKey, updated);
      toast.success('Profile saved');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<TopBar title="Profile" />}
      footer={
        <Button full size="lg" loading={saving} disabled={!name.trim()} onPress={() => void save()}>
          Save
        </Button>
      }
    >
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Avatar name={name || me.name} size={72} />
      </View>
      <FormMessage message={error} />
      <Input
        label="Full name"
        icon={<UserRound size={18} color={colors.muted} />}
        value={name}
        onChangeText={setName}
        autoComplete="name"
      />
      <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Mail size={18} color={colors.primaryStrong} />
        <View style={{ flex: 1 }}>
          <Text variant="smallStrong">{me.email}</Text>
          <Text variant="caption" tone="muted">
            {me.emailVerified ? 'Verified ✓ · ' : ''}Your sign-in email. Contact support to change it.
          </Text>
        </View>
      </Card>
      {!me.emailVerified ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <BadgeCheck size={18} color={colors.primaryStrong} />
            <Text variant="small" style={{ flex: 1 }}>
              Optional: confirm your email so reminder emails always reach you.
            </Text>
          </View>
          <Button
            variant="secondary"
            loading={requestCode.isPending}
            onPress={() =>
              requestCode.mutate(undefined, {
                onSuccess: () => {
                  setCode('');
                  setCodeError(null);
                  setVerifyOpen(true);
                },
                onError: (e) => toast.error('Could not send the code', e instanceof ApiError ? e.message : undefined),
              })
            }
          >
            Verify my email
          </Button>
        </Card>
      ) : null}
      <BottomSheet visible={verifyOpen} onClose={() => setVerifyOpen(false)} title="Enter the 6-digit code">
        <View style={{ gap: 14 }}>
          <Text variant="small" tone="muted">
            We sent it to {me.email}. It expires in 15 minutes.
          </Text>
          <FormMessage message={codeError} />
          <CodeInput value={code} onChange={setCode} />
          <Button
            full
            loading={verify.isPending}
            disabled={code.length !== 6}
            onPress={() =>
              verify.mutate(code, {
                onSuccess: () => {
                  setVerifyOpen(false);
                  toast.success('Email verified ✅');
                },
                onError: (e) => setCodeError(e instanceof ApiError ? e.message : 'That code didn’t work'),
              })
            }
          >
            Verify
          </Button>
        </View>
      </BottomSheet>
    </Screen>
  );
}
