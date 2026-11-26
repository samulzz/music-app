import { apiRequest, deviceIsOffline } from './api';
import type { MusicSong, ApiLibrarySong } from '../types/music';
import { fromApiLibrarySong } from '../types/music';

export async function refreshRecordings(songs: MusicSong[]): Promise<MusicSong[]> {
  if (await deviceIsOffline()) return songs;
  const ids = [...new Set(songs.map(s => Number(s.id)).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 250);
  if (!ids.length) return songs;
  try {
    const rows = await apiRequest<ApiLibrarySong[]>(`/songs/recordings?ids=${ids.join(',')}`, { timeoutMs: 1500 });
    const byId = new Map(rows.map(s => [String(s.id), fromApiLibrarySong(s)]));
    return songs.map(song => {
      const fresh = byId.get(song.id);
      if (!fresh) return song;
      const changed = song.sourceId && fresh.sourceId && song.sourceId !== fresh.sourceId;
      return { ...song, ...fresh, localUri: changed ? undefined : song.localUri,
        downloadedAt: changed ? undefined : song.downloadedAt, sizeBytes: changed ? undefined : song.sizeBytes };
    });
  } catch { return songs; }
}
