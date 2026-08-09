import { router } from 'expo-router';

import { clearSession, getSession } from './auth';
import { API_BASE_URL, APP_HEADERS } from './config';

export class OfflineError extends Error {
  constructor(message = 'Sem conexão com a internet.') {
    super(message);
    this.name = 'OfflineError';
  }
}

let authRedirectInFlight = false;

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
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const {
    authenticated = true,
    json = false,
    headers: requestHeaders,
    ...request
  } = options;

  const headers = authenticated
    ? await getAuthenticatedHeaders(json)
    : {
        ...APP_HEADERS,
        ...(json ? { 'Content-Type': 'application/json' } : {}),
      };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...request,
      headers: {
        ...headers,
        ...requestHeaders,
      },
    });
  } catch {
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
  return parsedBody as T;
}
