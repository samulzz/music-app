import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from './api';
import { getSession } from './auth';

export type StatsRank = { name: string; subtitle: string; coverUrl?: string; seconds: number; minutes: number };
export type ListeningCapsule = {
  month: string; label: string; complete: boolean; seconds: number; minutes: number;
  songs: number; artists: number; activeDays: number; plays: number;
  topSongs: StatsRank[]; topArtists: StatsRank[]; topGenres: StatsRank[];
  availableMonths: string[]; trackingSince: number | null;
};
export const getListeningCapsule = (month?: string) => apiRequest<ListeningCapsule>(`/listening-stats${month ? `?month=${encodeURIComponent(month)}` : ''}`);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const value = Math.floor(Math.random() * 16); return (c === 'x' ? value : (value & 3) | 8).toString(16);
});
type Slice = { eventId: string; sessionId: string; sourceId: string; seconds: number; occurredAt: number };
let previous: { sourceId: string; position: number; at: number; sessionId: string; seconds: number; playing: boolean } | null = null;
let writing = Promise.resolve();

function enqueue(slice?: Slice) {
  const owner = getSession();
  writing = writing.catch(() => {}).then(async () => {
    const session = await owner;
    if (!session?.username) return;
    if ((await getSession())?.username !== session.username) return;
    const key = `nationmusics.stats.pending.${session.username}`;
    const pending: Slice[] = JSON.parse(await AsyncStorage.getItem(key) || '[]');
    if (slice) pending.push(slice);
    await AsyncStorage.setItem(key, JSON.stringify(pending));
    while (pending.length) {
      const current = await getSession();
      if (current?.username !== session.username) return;
      try {
        await apiRequest('/listening-stats', { method: 'POST', json: true, body: JSON.stringify(pending[0]) });
      } catch { return; }
      pending.shift();
      await AsyncStorage.setItem(key, JSON.stringify(pending));
    }
  });
}

export function flushPendingListening() { enqueue(); }

export function sampleListening(sourceId: string, position: number, playing: boolean) {
  const now = Date.now();
  if (previous && previous.sourceId === sourceId) {
    const delta = position - previous.position;
    const elapsed = (now - previous.at) / 1000;
    // Saltos de posição e períodos em pausa não são tempo ouvido.
    if (previous.playing && delta > 0 && delta <= elapsed + 1.5) previous.seconds += Math.min(delta, elapsed);
  }
  if (previous && (previous.sourceId !== sourceId || !playing || previous.seconds >= 30)) {
    const seconds = Math.min(60, Math.floor(previous.seconds));
    if (seconds > 0) enqueue({ eventId: uuid(), sessionId: previous.sessionId,
      sourceId: previous.sourceId, seconds, occurredAt: previous.at });
    previous.seconds -= seconds;
  }
  if (!sourceId) { previous = null; return; }
  if (!previous || previous.sourceId !== sourceId) previous = { sourceId, position, at: now, sessionId: uuid(), seconds: 0, playing };
  previous.position = position; previous.at = now; previous.playing = playing;
}
