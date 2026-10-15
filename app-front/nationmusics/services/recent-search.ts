import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { getSession, type AuthSession } from './auth';
import { fromApiSearchSong, type ApiSearchSong, type MusicSong } from '../types/music';

type Pending = { song: MusicSong; at: number };
type History = { songs: MusicSong[]; pending: Pending[] };
const writes = new Map<string, Promise<unknown>>();
const refreshing = new Map<string, Promise<MusicSong[]>>();
const listeners = new Set<(username: string, songs: MusicSong[]) => void>();
const key = (username: string) => `search-recent.v2.account.${encodeURIComponent(username)}`;

export function mergeRecentSongs(...groups: MusicSong[][]): MusicSong[] {
  const seen = new Set<string>();
  return groups.flat().filter(song => {
    const id = String(song?.sourceId || song?.id || '');
    if (!id || !song?.title || seen.has(id)) return false;
    seen.add(id); return true;
  }).slice(0, 20);
}
async function read(username: string): Promise<History> {
  try {
    const raw = await AsyncStorage.getItem(key(username));
    if (raw) { const value = JSON.parse(raw); return { songs: mergeRecentSongs(value.songs || []), pending: value.pending || [] }; }
    // Legacy caches could have been written by a request from another account.
    // Bootstrap from the account-authenticated server instead of trusting those rows.
    return { songs: [], pending: [] };
  } catch { return { songs: [], pending: [] }; }
}
function mutate(username: string, change: (current: History) => History) {
  const next = (writes.get(username) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await read(username);
    const value = change(previous);
    await AsyncStorage.setItem(key(username), JSON.stringify(value));
    if (JSON.stringify(previous.songs) !== JSON.stringify(value.songs)) listeners.forEach(listener => listener(username, value.songs));
    return value;
  });
  writes.set(username, next); return next;
}
function options(session: AuthSession) {
  return { authenticated: false, headers: { Authorization: `Bearer ${session.token}` }, timeoutMs: 3000 };
}
export function subscribeRecentSearch(listener: (username: string, songs: MusicSong[]) => void) {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export async function getCachedRecentSearch(username: string) {
  await writes.get(username)?.catch(() => {});
  return (await read(username)).songs;
}
export async function refreshRecentSearch(session: AuthSession): Promise<MusicSong[]> {
  if (refreshing.has(session.username)) return refreshing.get(session.username)!;
  const operation = (async () => {
    const snapshot = await read(session.username);
    for (const pending of snapshot.pending) {
      try {
        await apiRequest(`/search/recent/${encodeURIComponent(pending.song.id)}`, { ...options(session), method: 'POST' });
        await mutate(session.username, current => ({ ...current,
          pending: current.pending.filter(item => item.song.id !== pending.song.id || item.at !== pending.at) }));
      } catch { break; }
    }
    try {
      const remote = (await apiRequest<ApiSearchSong[]>('/search/recent', options(session))).map(fromApiSearchSong);
      const value = await mutate(session.username, current => ({ ...current,
        songs: mergeRecentSongs([...current.pending].reverse().map(item => item.song), remote, current.songs) }));
      return value.songs;
    } catch { return getCachedRecentSearch(session.username); }
  })().finally(() => { refreshing.delete(session.username); });
  refreshing.set(session.username, operation); return operation;
}
export async function rememberRecentSearch(song: MusicSong) {
  const session = await getSession();
  if (!session?.token) return;
  await mutate(session.username, current => ({
    songs: mergeRecentSongs([song], current.songs),
    pending: [...current.pending.filter(item => item.song.id !== song.id), { song, at: Date.now() }].slice(-20),
  }));
  // A record made during a refresh must be flushed after that refresh, not lost behind it.
  void (async () => { await refreshing.get(session.username); await refreshRecentSearch(session); })().catch(() => {});
}
