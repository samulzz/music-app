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

export type PersonalizedHome = {
  continueListening: null | {
    song: {
      id: string;
      sourceId?: string;
      title: string;
      artist: string;
      artworkUrl?: string;
      remoteUrl?: string;
    };
    positionSeconds: number;
    durationSeconds: number;
    updatedAt: number;
    contextType?: string;
    contextId?: string;
    contextName?: string;
  };
  recentSongs: ApiLibrarySong[];
  topArtists: Array<{ name: string; artworkUrl?: string; score: number }>;
  recommendedSongs: ApiLibrarySong[];
  frequentPlaylists: Array<{ id: number; name: string; description?: string; iconUrl?: string }>;
  recommendationReason: string;
  dailyMix: DailyMix;
};

export function getDailyMix() {
  return apiRequest<DailyMix>('/recommendations/daily');
}

export function getPersonalizedHome() {
  return apiRequest<PersonalizedHome>('/recommendations/home');
}

export async function getDailyMixSongs(): Promise<MusicSong[]> {
  const mix = await getDailyMix();
  return (mix.songs || []).map(fromApiLibrarySong);
}

export async function getRadioSongs(anchor?: Pick<MusicSong, 'sourceId'>, excluded: string[] = []): Promise<MusicSong[]> {
  const songs = await apiRequest<ApiLibrarySong[]>(`/recommendations/radio?sourceId=${encodeURIComponent(anchor?.sourceId || '')}&limit=30&exclude=${encodeURIComponent(excluded.slice(-200).join(','))}`);
  return songs.map(fromApiLibrarySong);
}

export function getRecommendationFeedback(song: Pick<MusicSong, 'id' | 'sourceId'>) {
  const id = Number(song.id);
  return apiRequest<{ liked: boolean }>(`/recommendations/feedback?sourceId=${encodeURIComponent(song.sourceId || '')}${Number.isFinite(id) ? `&songId=${id}` : ''}`);
}

export function reportPlayback(payload: {
  songId?: number;
  sourceId?: string;
  listenedSeconds: number;
  completed: boolean;
  durationSeconds?: number;
  outcome?: 'LISTENED' | 'SKIPPED' | 'COMPLETED' | 'REPEATED';
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
