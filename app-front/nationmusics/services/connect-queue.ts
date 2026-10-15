import type { ConnectState } from './connect';
import { apiRequest } from './api';
import { getAccountLibrary } from './offline-library';
import { getDailyMix } from './recommendations';
import { fromApiLibrarySong, type ApiLibrarySong, type MusicSong } from '../types/music';

export async function getConnectQueue(state: ConnectState) {
  if (!state.song) return { songs: [] as MusicSong[], index: 0, context: null };
  const fallback: MusicSong = { ...state.song, id: state.song.id || state.song.sourceId || '' };
  let songs = [fallback];
  try {
    if (state.contextType === 'library') songs = await getAccountLibrary();
    else if (state.contextType === 'daily') songs = (await getDailyMix()).songs.map(fromApiLibrarySong);
    else {
      const path = state.contextType === 'liked' ? '/recommendations/liked'
        : state.contextType === 'personal' && state.contextId ? `/playlists/personal/${encodeURIComponent(state.contextId)}/songs`
        : state.contextType === 'global' && state.contextId ? `/playlists/${encodeURIComponent(state.contextId)}/songs`
        : state.contextType === 'most-downloaded' ? '/playlists/most-downloaded/songs' : '';
      if (path) songs = (await apiRequest<ApiLibrarySong[]>(path)).map(fromApiLibrarySong);
    }
  } catch { /* Fall back to the transferred song and its radio when offline. */ }
  let index = songs.findIndex(song => (song.sourceId || song.id) === (fallback.sourceId || fallback.id));
  if (index < 0) { songs = [fallback, ...songs]; index = 0; }
  const context = state.contextType ? { type: state.contextType, id: state.contextId || '', name: state.contextName || '' } : null;
  return { songs, index, context };
}
