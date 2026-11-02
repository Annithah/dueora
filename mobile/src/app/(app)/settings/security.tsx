import { useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint, LockKeyhole } from 'lucide-react-native';
import { useEffect, useState } from 'react';

import { Screen } from '@/components/layout/Screen';
import { TopBar } from '@/components/layout/TopBar';
import {
  BottomSheet,
  Button,
  Card,
  FormMessage,
  ListItem,
  PasswordInput,
  Switch,
  Text,
  toast,
} from '@/components/ui';
import { ApiError, api } from '@/api';
import { signOut } from '@/features/auth/api';
import { usePreferences } from '@/state/preferences';
import { useTheme } from '@/theme';

export default function Security() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const biometric = usePreferences((s) => s.biometricLock);
  const setBiometric = usePreferences((s) => s.setBiometricLock);
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]).then(([hw, enrolled]) => setAvailable(hw && enrolled));
  }, []);

  const toggleBiometric = async (on: boolean) => {
    if (on) {
      const r = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Turn on biometric lock',
      });
      if (!r.success) return;
    }
    setBiometric(on);
    toast.info(on ? 'DueOra will ask for your fingerprint or face' : 'Biometric lock is off');
  };

  const changePassword = async () => {
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters');
    setSaving(true);
    try {
      await api.post('/me/password', { currentPassword: current, newPassword: next });
      setOpen(false);
      toast.success('Password changed', 'Please log in again on your devices.');
      await signOut(queryClient);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<TopBar title="Security" />}>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <ListItem
          icon={<LockKeyhole size={19} color={colors.primaryStrong} />}
          title="Change password"
          onPress={() => setOpen(true)}
        />
        <ListItem
          divider
          icon={<Fingerprint size={19} color={colors.primaryStrong} />}
          title="Biometric lock"
          subtitle={
            available ? 'Face ID or fingerprint when opening DueOra' : 'Not set up on this phone'
          }
          trailing={
            <Switch
              accessibilityLabel="Biometric lock"
              value={biometric}
              disabled={!available}
              onValueChange={(v) => void toggleBiometric(v)}
            />
          }
        />
      </Card>
      <Text variant="small" tone="muted">
        Changing your password signs you out everywhere. Your sign-in is stored in the phone&apos;s
        secure keystore.
      </Text>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Change password">
        <FormMessage message={error} />
        <PasswordInput label="Current password" value={current} onChangeText={setCurrent} />
        <PasswordInput
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
          textContentType="newPassword"
          autoComplete="new-password"
        />
        <Button full loading={saving} onPress={() => void changePassword()}>
          Update password
        </Button>
      </BottomSheet>
    </Screen>
  );
}
