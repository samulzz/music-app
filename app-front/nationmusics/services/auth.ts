import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export type AuthSession = {
  token: string;
  username: string;
  lastSuccessfulLoginAt: number;
};

const SESSION_KEY = 'nationmusics.auth.session.v2';
const LEGACY_TOKEN_KEY = 'userToken';
const LEGACY_USERNAME_KEY = 'username';

async function readSecureSession() {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return AsyncStorage.getItem(SESSION_KEY);
  }
}

async function writeSecureSession(value: string) {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, value);
  } catch {
    await AsyncStorage.setItem(SESSION_KEY, value);
  }
}

async function deleteSecureSession() {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const stored = await readSecureSession();
  if (stored) {
    try {
      const session = JSON.parse(stored) as AuthSession;
      if (session.token?.trim()) return session;
    } catch {}
  }

  const [legacyToken, legacyUsername] = await AsyncStorage.multiGet([
    LEGACY_TOKEN_KEY,
    LEGACY_USERNAME_KEY,
  ]);
  const token = legacyToken[1]?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const migrated: AuthSession = {
    token,
    username: legacyUsername[1] || '',
    lastSuccessfulLoginAt: Date.now(),
  };
  await saveSession(migrated);
  return migrated;
}

export async function saveSession(session: AuthSession) {
  const normalized: AuthSession = {
    ...session,
    token: session.token.replace(/^Bearer\s+/i, '').trim(),
  };
  await writeSecureSession(JSON.stringify(normalized));
  await AsyncStorage.multiSet([
    [LEGACY_TOKEN_KEY, normalized.token],
    [LEGACY_USERNAME_KEY, normalized.username],
  ]);
}

export async function clearSession() {
  await Promise.all([
    deleteSecureSession(),
    AsyncStorage.multiRemove([SESSION_KEY, LEGACY_TOKEN_KEY, LEGACY_USERNAME_KEY]),
  ]);
}
