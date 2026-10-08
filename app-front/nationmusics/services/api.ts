import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { clearSession, getSession } from './auth';
import { API_BASE_URL, APP_HEADERS } from './config';

export class OfflineError extends Error {
  constructor(message = 'Sem conexão com a internet.') {
    super(message);
    this.name = 'OfflineError';
  }
}

let authRedirectInFlight = false;
let serverUnavailable = false;

export async function accountCacheKey(base: string) {
  const session = await getSession();
  return `${base}.account.${encodeURIComponent(session?.username || 'guest')}`;
}

export async function deviceIsOffline() {
  if (serverUnavailable) return true;
  try { return (await NetInfo.fetch()).isConnected === false; } catch { return false; }
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

export async function getAuthenticatedHeaders(includeJson = false) {
  const session = await getSession();
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

  const headers = authenticated
    ? await getAuthenticatedHeaders(json)
    : {
        ...APP_HEADERS,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      };

  let response: Response | undefined;
  const method = String(request.method || 'GET').toUpperCase();
  const cacheable = method === 'GET' && /^\/(songs\/(my-library|search|genre|artist)|playlists|catalog|recommendations\/(home|daily))(?:[/?]|$)/.test(path);
  const cacheKey = cacheable ? await accountCacheKey(`nationmusics.api-cache.${path}`) : '';
  const cached = async () => {
    if (!cacheKey) return null;
    try { const raw = await AsyncStorage.getItem(cacheKey); return raw ? JSON.parse(raw) as { data: T } : null; } catch { return null; }
  };
  const networkDisconnected = cacheable && (await NetInfo.fetch().catch(() => null))?.isConnected === false;
  if (networkDisconnected) {
    const stored = await cached();
    if (stored) return stored.data;
    throw new OfflineError();
  }
  const attempts = method === 'GET' || method === 'HEAD' ? 2 : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs || (cacheable ? 6000 : 20_000));
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...request,
        signal: request.signal || controller.signal,
        headers: {
          ...headers,
          ...requestHeaders,
        },
      });
      break;
    } catch {
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 650));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!response) {
    serverUnavailable = true;
    const stored = await cached();
    if (stored) return stored.data;
    throw new OfflineError();
  }

  const rawBody = response.status === 204 ? '' : await response.text();
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
      serverUnavailable = true;
      const stored = await cached();
      if (stored) return stored.data;
    }
    const message = typeof parsedBody === 'object' && parsedBody !== null && 'message' in parsedBody
      ? String(parsedBody.message)
      : String(parsedBody || '').trim();
    if (response.status === 401 || response.status === 403) {
      void handleInvalidSession();
      throw new Error(message || 'Sessão inválida. Conecte-se e faça login novamente.');
    }
    throw new Error(message || `Erro do servidor (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  serverUnavailable = false;
  if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: parsedBody, savedAt: Date.now() })).catch(() => {});
  return parsedBody as T;
}
