import { useSession } from '@/state/session';

import { createApiClient } from './client';
import { getApiUrl, rediscoverApiUrl } from './discovery';

/** App-wide API client wired to the session store. */
export const api = createApiClient({
  baseUrl: getApiUrl,
  rediscover: () => rediscoverApiUrl(),
  getTokens: () => useSession.getState().tokens,
  setTokens: (tokens) => useSession.getState().setTokens(tokens),
  getOrgId: () => useSession.getState().activeWorkspaceId,
  onSessionExpired: () => {
    void useSession.getState().signOut();
  },
});

export { ApiError, type Tokens } from './client';
