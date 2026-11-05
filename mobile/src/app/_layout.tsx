import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createQueryClient } from '@/api/queryClient';
import { ToastHost } from '@/components/ui';
import { AppLock } from '@/components/layout/AppLock';
import { usePreferences } from '@/state/preferences';
import { useSession } from '@/state/session';
import { ThemeProvider, useNativeAppearance, useTheme } from '@/theme';
import { appFonts } from '@/theme/fonts';

void SplashScreen.preventAutoHideAsync();

/** Cached query data survives restarts: the app opens instantly and works read-only offline. */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'dueora.query-cache',
  throttleTime: 2000,
});

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const status = useSession((s) => s.status);
  const signedIn = status === 'signedIn';
  useNativeAppearance(colors.canvas);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="invite" />
        {/* Reachable signed in too: Help → "View intro again". */}
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="splash" options={{ animation: 'fade' }} />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      <ToastHost />
      {signedIn ? <AppLock /> : null}
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const status = useSession((s) => s.status);
  const hydrate = useSession((s) => s.hydrate);
  const hydratePrefs = usePreferences((s) => s.hydrate);
  const prefsReady = usePreferences((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
    void hydratePrefs();
  }, [hydrate, hydratePrefs]);

  const ready = (fontsLoaded || !!fontError) && status !== 'loading' && prefsReady;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          // Bump `buster` whenever API response shapes change: an old cache would crash new screens.
          persistOptions={{ persister, maxAge: 7 * 24 * 60 * 60 * 1000, buster: 'v2-subscriptions' }}
        >
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
