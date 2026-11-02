import { Redirect } from 'expo-router';

import { useSession } from '@/state/session';

/** Entry gate: signed-in users go to the app, returning users to login, new users to the welcome screen. */
export default function Index() {
  const status = useSession((s) => s.status);
  const hasOnboarded = useSession((s) => s.hasOnboarded);

  if (status === 'signedIn') return <Redirect href="/(app)/(tabs)" />;
  return <Redirect href={hasOnboarded ? '/login' : '/welcome'} />;
}
