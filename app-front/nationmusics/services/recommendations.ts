import type { ApiLibrarySong, MusicSong } from '../types/music';
import { fromApiLibrarySong } from '../types/music';
import { apiRequest } from './api';

export type DailyMix = {
  id: string;
  name: string;
  description: string;
  generatedFor: string;
  songs: ApiLibrarySong[];
};

export function getDailyMix() {
  return apiRequest<DailyMix>('/recommendations/daily');
}

export async function getDailyMixSongs(): Promise<MusicSong[]> {
  const mix = await getDailyMix();
  return (mix.songs || []).map(fromApiLibrarySong);
}

export function reportPlayback(payload: {
  songId?: number;
  sourceId?: string;
  listenedSeconds: number;
  completed: boolean;
}) {
  return apiRequest<void>('/recommendations/listen', {
    method: 'POST',
    json: true,
    body: JSON.stringify(payload),
  });
}

export function sendRecommendationFeedback(song: Pick<MusicSong, 'id' | 'sourceId'>, action: 'LIKE' | 'DISLIKE' | 'CLEAR') {
  const numericId = Number(song.id);
  return apiRequest<void>('/recommendations/feedback', {
    method: 'PUT',
    json: true,
    body: JSON.stringify({
      songId: Number.isFinite(numericId) ? numericId : null,
      sourceId: song.sourceId || null,
      action,
    }),
  });
}
