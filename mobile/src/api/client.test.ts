import { ApiError, createApiClient, type ApiClientDeps, type Tokens } from './client';
import { resolveApiUrl } from './config';

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  let tokens: Tokens | null = { accessToken: 'access-1', refreshToken: 'refresh-1' };
  const calls: { url: string; init: RequestInit }[] = [];
  const onSessionExpired = jest.fn();
  const deps: ApiClientDeps = {
    baseUrl: 'https://api.dueora.test/',
    getTokens: () => tokens,
    setTokens: (t) => {
      tokens = t;
    },
    getOrgId: () => 'org_1',
    onSessionExpired,
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      return responder(url, init ?? {});
    }) as typeof fetch,
  };
  return { api: createApiClient(deps), calls, onSessionExpired, tokens: () => tokens };
}

const header = (init: RequestInit, name: string) => (init.headers as Record<string, string>)[name];

describe('createApiClient', () => {
  it('sends JSON with auth and org headers under /api/v1', async () => {
    const { api, calls } = setup(() => json(200, { ok: true }));
    await expect(api.post('/obligations', { name: 'Hosting' })).resolves.toEqual({ ok: true });
    const [call] = calls;
    expect(call?.url).toBe('https://api.dueora.test/api/v1/obligations');
    expect(header(call!.init, 'Authorization')).toBe('Bearer access-1');
    expect(header(call!.init, 'X-Org-Id')).toBe('org_1');
    expect(header(call!.init, 'Content-Type')).toBe('application/json');
    expect(call?.init.body).toBe('{"name":"Hosting"}');
  });

  it('builds query strings and skips empty values', async () => {
    const { api, calls } = setup(() => json(200, []));
    await api.get('/history', { q: 'cloud flare', page: 2, category: undefined, provider: '' });
    expect(calls[0]?.url).toBe('https://api.dueora.test/api/v1/history?q=cloud%20flare&page=2');
  });

  it('maps API errors to ApiError', async () => {
    const { api } = setup(() => json(403, { error: { code: 'FORBIDDEN', message: 'Nope' } }));
    await expect(api.get('/team')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'Nope',
    });
  });

  it('handles 204 No Content', async () => {
    const { api } = setup(() => new Response(null, { status: 204 }));
    await expect(api.del('/obligations/1')).resolves.toBeUndefined();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const { api, calls, tokens } = setup((url, init) => {
      if (url.endsWith('/auth/refresh'))
        return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      return header(init, 'Authorization') === 'Bearer access-2'
        ? json(200, { ok: 1 })
        : json(401, {});
    });
    await expect(api.get('/me')).resolves.toEqual({ ok: 1 });
    expect(calls.map((c) => c.url.replace('https://api.dueora.test/api/v1', ''))).toEqual([
      '/me',
      '/auth/refresh',
      '/me',
    ]);
    expect(tokens()).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    // The refresh call itself never carries the (expired) access token.
    expect(header(calls[1]!.init, 'Authorization')).toBeUndefined();
  });

  it('shares one refresh between concurrent requests', async () => {
    let refreshes = 0;
    const { api } = setup(async (url, init) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 10));
        return json(200, { accessToken: 'access-2', refreshToken: 'refresh-2' });
      }
      return header(init, 'Authorization') === 'Bearer access-2'
        ? json(200, { ok: 1 })
        : json(401, {});
    });
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshes).toBe(1);
  });

  it('ends the session when the refresh token is rejected', async () => {
    const { api, onSessionExpired } = setup(() =>
      json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }),
    );
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('reports network failures as status 0', async () => {
    const { api } = setup(() => {
      throw new TypeError('Network request failed');
    });
    const err = await api.get('/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).isNetworkError).toBe(true);
    expect((err as ApiError).code).toBe('NETWORK');
  });
});

describe('resolveApiUrl', () => {
  it('defaults to localhost in development', () => {
    expect(resolveApiUrl(undefined, true)).toBe('http://localhost:4000');
    expect(resolveApiUrl('http://192.168.1.20:4000/', true)).toBe('http://192.168.1.20:4000');
  });

  it('requires an https URL in release builds', () => {
    expect(() => resolveApiUrl(undefined, false)).toThrow(/not set/);
    expect(() => resolveApiUrl('http://api.dueora.app', false)).toThrow(/https/);
    expect(resolveApiUrl('https://api.dueora.app', false)).toBe('https://api.dueora.app');
  });
});
