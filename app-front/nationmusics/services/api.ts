import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { clearSession, getSession, getCachedSession } from './auth';
import { API_BASE_URL, APP_HEADERS } from './config';

export class OfflineError extends Error {
  constructor(message = 'Sem conexão com a internet.') {
    super(message);
    this.name = 'OfflineError';
  }
}

let authRedirectInFlight = false;

export async function accountCacheKey(base: string) {
  const session = await getSession();
  return `${base}.account.${encodeURIComponent(session?.username || 'guest')}`;
}

type Connectivity = { isConnected: boolean | null; isInternetReachable?: boolean | null };
let connectivity: Connectivity | null = null;
let networkRead: Promise<Connectivity | null> | null = null;
try { NetInfo.addEventListener?.((state) => { connectivity = state; }); } catch {}
export async function deviceIsOffline() {
  // Network state is shared, but a VPS failure never changes it.
  if (!connectivity || connectivity.isConnected === null) {
    networkRead ??= NetInfo.fetch().then(state => { connectivity = state; return state; }).catch(() => null).finally(() => { networkRead = null; });
    await Promise.race([networkRead, new Promise(resolve => setTimeout(resolve, 150))]);
  }
  return connectivity?.isConnected === false || connectivity?.isInternetReachable === false;
}

async function handleInvalidSession() {
  if (authRedirectInFlight) return;
  authRedirectInFlight = true;
  try {
    await clearSession();
  } catch {}
  setTimeout(() => {
    try {
      router.replace('/login');
    } catch {}
    authRedirectInFlight = false;
  }, 0);
}

export async function getAuthenticatedHeaders(includeJson = false, capturedSession?: Awaited<ReturnType<typeof getSession>>) {
  const session = capturedSession === undefined ? await getSession() : capturedSession;
  if (!session?.token) {
    void handleInvalidSession();
    throw new Error('Sessão indisponível. Entre novamente quando houver internet.');
  }

  return {
    ...APP_HEADERS,
    Authorization: `Bearer ${session.token}`,
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  };
}

export async function getMediaHeaders(): Promise<Record<string, string>> {
  let token = '';
  try {
    const session = await getSession();
    token = session?.token?.trim() || '';
  } catch {}

  return {
    ...APP_HEADERS,
    Accept: 'audio/mpeg,audio/*',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

type ApiRequestOptions = RequestInit & {
  authenticated?: boolean;
  json?: boolean;
  timeoutMs?: number;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    authenticated = true,
    json = false,
    headers: requestHeaders,
    timeoutMs,
    ...request
  } = options;

  const requestOwner = getCachedSession?.() || await getSession();
  const headers = authenticated
    ? await getAuthenticatedHeaders(json, requestOwner)
    : {
        ...APP_HEADERS,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      };

  let response: Response | undefined;
  const method = String(request.method || 'GET').toUpperCase();
  const cacheable = method === 'GET' && /^\/(songs\/(my-library|search|genre|artist)|playlists|catalog|recommendations\/(daily|liked))(?:[/?]|$)/.test(path);
  const cacheKey = cacheable ? `nationmusics.api-cache.${path}.account.${encodeURIComponent(requestOwner?.username || 'guest')}` : '';
  const cached = async () => {
    if (!cacheKey) return null;
    try { const raw = await AsyncStorage.getItem(cacheKey); return raw ? JSON.parse(raw) as { data: T } : null; } catch { return null; }
  };
  const networkDisconnected = await deviceIsOffline();
  if (networkDisconnected) {
    const stored = await cached();
    if (stored) return stored.data;
    throw new OfflineError();
  }
  const attempts = 1; // Cached reads should not wait through repeated network timeouts.
  let rawBody = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort);
    if (request.signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, timeoutMs || (cacheable ? 4000 : 6000));
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...request,
        signal: controller.signal,
        headers: {
          ...headers,
          ...requestHeaders,
        },
      });
      rawBody = response.status === 204 ? '' : await response.text();
      break;
    } catch {
      response = undefined;
      if (request.signal?.aborted) { const error = new Error('Busca cancelada.'); error.name = 'AbortError'; throw error; }
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abort);
    }
  }

  if (!response) {
    const stored = await cached();
    if (stored) return stored.data;
    throw new OfflineError();
  }

  let parsedBody: unknown = rawBody;
  if (rawBody.trim()) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  if (!response.ok) {
    if (response.status >= 500) {
      const stored = await cached();
      if (stored) return stored.data;
    }
    const message = typeof parsedBody === 'object' && parsedBody !== null && 'message' in parsedBody
      ? String(parsedBody.message)
      : String(parsedBody || '').trim();
    if (response.status === 401 || response.status === 403) {
      const sentAuth = new Headers(requestHeaders).get('Authorization') || new Headers(headers).get('Authorization');
      const current = await getSession();
      if (!sentAuth || sentAuth === `Bearer ${current?.token}`) void handleInvalidSession();
      throw new Error(message || 'Sessão inválida. Conecte-se e faça login novamente.');
    }
    throw new Error(message || `Erro do servidor (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: parsedBody, savedAt: Date.now() })).catch(() => {});
  return parsedBody as T;
}
