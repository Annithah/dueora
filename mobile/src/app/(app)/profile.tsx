import { useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/layout/QueryState';
import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import { Avatar, Button, Card, FormMessage, Input, Text, toast } from '@/components/ui';
import { ApiError, api } from '@/api';
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
  const [phone, setPhone] = useState(me.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await api.patch<Me>('/me', {
        name: name.trim(),
        phone: phone.trim() || null,
      });
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
        <Text variant="small" tone="muted">
          {me.emailVerified ? 'Email verified ✓' : 'Email not verified yet'}
        </Text>
      </View>
      <FormMessage message={error} />
      <Input
        label="Full name"
        icon={<UserRound size={18} color={colors.muted} />}
        value={name}
        onChangeText={setName}
        autoComplete="name"
      />
      <Input
        label="Phone (optional)"
        icon={<Phone size={18} color={colors.muted} />}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+250 788 000 000"
      />
      <Card tone="primary" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Mail size={18} color={colors.primaryStrong} />
        <View style={{ flex: 1 }}>
          <Text variant="smallStrong">{me.email}</Text>
          <Text variant="caption" tone="muted">
            Your sign-in email. Contact support to change it.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
