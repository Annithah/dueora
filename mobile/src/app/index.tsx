import { Redirect } from 'expo-router';

import { useSession } from '@/state/session';

/**
 * Entry gate:
 * - signed in → dashboard
 * - first launch on this install → splash → intro slides → welcome
 * - seen the intro before (e.g. after logging out) → login
 */
export default function Index() {
  const status = useSession((s) => s.status);
  const hasOnboarded = useSession((s) => s.hasOnboarded);

  if (status === 'signedIn') return <Redirect href="/(app)/(tabs)" />;
  return <Redirect href={hasOnboarded ? '/login' : '/splash'} />;
}
