import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { Button, Logo, Text } from '@/components/ui';
import { usePreferences } from '@/state/preferences';
import { palette } from '@/theme';

const RELOCK_AFTER_MS = 30_000;

/** Covers the app until the user authenticates, on launch and after 30 s in the background. */
export function AppLock() {
  const enabled = usePreferences((s) => s.biometricLock);
  const [locked, setLocked] = useState(enabled);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock DueOra' });
    if (r.success) setLocked(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const authenticate = () =>
      LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock DueOra' }).then((r) => {
        if (r.success) setLocked(false);
      });
    void authenticate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgroundedAt.current = Date.now();
      if (
        state === 'active' &&
        backgroundedAt.current &&
        Date.now() - backgroundedAt.current > RELOCK_AFTER_MS
      ) {
        setLocked(true);
        void authenticate();
      }
    });
    return () => sub.remove();
  }, [enabled]);

  if (!enabled || !locked) return null;
  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2000,
        backgroundColor: palette.teal800,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 32,
      }}
    >
      <Logo size={52} inverse />
      <Text variant="body" color="rgba(255,255,255,0.85)" align="center">
        DueOra is locked
      </Text>
      <Button
        variant="inverse"
        icon={<Fingerprint size={20} color={palette.teal800} />}
        onPress={() => void unlock()}
      >
        Unlock
      </Button>
    </View>
  );
}
