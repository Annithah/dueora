/**
 * Fetch wrapper for the DueOra API.
 * - JSON in/out, typed errors (ApiError)
 * - Bearer access token + X-Workspace-Id workspace header
 * - On 401 it refreshes the session once (single-flight: concurrent requests share one
 *   refresh) and retries; if refreshing fails the session is ended.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface ApiClientDeps {
  baseUrl: string;
  getTokens: () => Tokens | null;
  setTokens: (tokens: Tokens) => Promise<void> | void;
  getOrgId: () => string | null;
  /** Called when the refresh token is rejected; the app signs out. */
  onSessionExpired: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the access token (default true). */
  auth?: boolean;
  /** Send X-Workspace-Id (default true when signed in). */
  org?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, query?: RequestOptions['query']): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  del<T = void>(path: string): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string; details?: unknown } } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // Non-JSON error (proxy page etc.)
  }
  return new ApiError(
    res.status,
    body.error?.code ?? `HTTP_${res.status}`,
    body.error?.message ?? `Request failed (${res.status})`,
    body.error?.details,
  );
}

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const doFetch = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 20_000;
  let refreshing: Promise<boolean> | null = null;

  async function send(
    path: string,
    options: RequestOptions,
    accessToken: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
    const workspaceId = deps.getOrgId();
    if (workspaceId && options.org !== false) headers['X-Workspace-Id'] = workspaceId;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    options.signal?.addEventListener('abort', () => controller.abort());
    try {
      return await doFetch(buildUrl(deps.baseUrl, path, options.query), {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      throw new ApiError(
        0,
        aborted ? 'TIMEOUT' : 'NETWORK',
        aborted ? 'The request timed out' : "Can't reach DueOra. Check your connection.",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Exchange the refresh token for a new pair. Concurrent callers share one attempt. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const tokens = deps.getTokens();
      if (!tokens) return false;
      try {
        const res = await send(
          '/auth/refresh',
          { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false, org: false },
          null,
        );
        if (!res.ok) return false;
        const next = (await res.json()) as Tokens;
        await deps.setTokens({ accessToken: next.accessToken, refreshToken: next.refreshToken });
        return true;
      } catch {
        // Network failure: keep the session; the caller sees the original 401.
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const tokens = deps.getTokens();
    let res = await send(path, options, tokens?.accessToken ?? null);

    if (res.status === 401 && tokens && options.auth !== false) {
      const ok = await refresh();
      if (!ok) {
        deps.onSessionExpired();
        throw await toApiError(res);
      }
      res = await send(path, options, deps.getTokens()?.accessToken ?? null);
    }

    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    get: (path, query) => request(path, { query }),
    post: (path, body) => request(path, { method: 'POST', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    del: (path) => request(path, { method: 'DELETE' }),
  };
}
