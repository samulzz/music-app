import TrackPlayer, { type MediaItem } from '@rntp/player';

import type { MusicSong } from '../types/music';
import { apiRequest } from './api';
import { playSongQueue } from './player';
import {
  getActiveMediaItemSafely,
  getPlayerProgressSafely,
  isPlayerPlayingSafely,
} from './player-state';

export type JamSong = {
  id: string;
  sourceId: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  remoteUrl?: string;
};

export type JamPlaybackState = {
  song: JamSong;
  positionSeconds: number;
  playing: boolean;
  updatedAt: number;
  volumeLevel?: number;
};

export type JamPermissions = {
  allowParticipantControl: boolean;
  allowParticipantQueue: boolean;
  syncVolume: boolean;
};

export type JamParticipant = {
  username: string;
  owner: boolean;
  active: boolean;
  joinedAt: number;
  lastSeenAt: number;
};

export type JamSession = {
  code: string;
  inviteLink: string;
  hostUsername: string;
  participants: string[];
  state: JamPlaybackState;
  serverTime: number;
  owner?: boolean;
  canControl?: boolean;
  canManage?: boolean;
  canQueue?: boolean;
  permissions?: JamPermissions;
  participantDetails?: JamParticipant[];
  queue?: JamSong[];
  volumeLevel?: number;
};

type JamStatePayload = {
  song: JamSong;
  positionSeconds: number;
  playing: boolean;
  volumeLevel?: number;
};

export type JamSettingsPayload = {
  allowParticipantControl?: boolean;
  allowParticipantQueue?: boolean;
  syncVolume?: boolean;
  volumeLevel?: number;
};

type SessionListener = (session: JamSession) => void;

let hostTimer: ReturnType<typeof setInterval> | null = null;
let followTimer: ReturnType<typeof setInterval> | null = null;
let hostInFlight = false;
let followInFlight = false;
let currentJamCode = '';

function extrasOf(item: MediaItem | null | undefined) {
  return item?.extras && typeof item.extras === 'object'
    ? item.extras as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function remoteUrlFromMediaItem(item: MediaItem) {
  const rawUrl = typeof item.url === 'string'
    ? item.url
    : item.url && typeof item.url === 'object' && 'uri' in item.url
    ? String(item.url.uri || '')
    : '';
  if (rawUrl.startsWith('file:') || rawUrl.startsWith('content:')) return '';
  return rawUrl;
}

export function mediaItemToJamSong(item: MediaItem | null | undefined): JamSong | null {
  if (!item) return null;

  const extras = extrasOf(item);
  const sourceId = stringValue(extras.sourceId) || stringValue(item.mediaId);
  if (!sourceId) return null;

  return {
    id: stringValue(item.mediaId) || sourceId,
    sourceId,
    title: stringValue(item.title) || 'Musica',
    artist: stringValue(item.artist) || 'Artista desconhecido',
    artworkUrl: stringValue(item.artworkUrl) || undefined,
    remoteUrl: remoteUrlFromMediaItem(item) || undefined,
  };
}

function jamSongToMusicSong(song: JamSong): MusicSong {
  return {
    id: song.id || song.sourceId,
    sourceId: song.sourceId || song.id,
    title: song.title || 'Musica',
    artist: song.artist || 'Artista desconhecido',
    artworkUrl: song.artworkUrl,
    remoteUrl: song.remoteUrl,
  };
}

function readCurrentJamState(): JamStatePayload | null {
  const activeItem = getActiveMediaItemSafely();
  const song = mediaItemToJamSong(activeItem);
  if (!song) return null;

  const progress = getPlayerProgressSafely();
  let volumeLevel = 1;
  try {
    volumeLevel = Math.max(0, Math.min(1, Number(TrackPlayer.getVolume()) || 1));
  } catch {}
  return {
    song,
    positionSeconds: Math.max(0, Number(progress.position) || 0),
    playing: isPlayerPlayingSafely(),
    volumeLevel,
  };
}

export async function createJamFromPlayer(
  activeItem: MediaItem | null,
  positionSeconds: number,
  playing: boolean
) {
  const song = mediaItemToJamSong(activeItem);
  if (!song) {
    throw new Error('Toque uma musica antes de criar a JAM.');
  }
  let volumeLevel = 1;
  try {
    volumeLevel = Math.max(0, Math.min(1, Number(TrackPlayer.getVolume()) || 1));
  } catch {}

  return apiRequest<JamSession>('/jams', {
    method: 'POST',
    json: true,
    body: JSON.stringify({
      song,
      positionSeconds: Math.max(0, Number(positionSeconds) || 0),
      playing,
      volumeLevel,
    } satisfies JamStatePayload),
  });
}

export function joinJam(code: string) {
  return apiRequest<JamSession>(`/jams/${encodeURIComponent(code)}/join`, {
    method: 'POST',
  });
}

export function getJam(code: string) {
  return apiRequest<JamSession>(`/jams/${encodeURIComponent(code)}`);
}

export function updateJamState(code: string, payload: JamStatePayload) {
  return apiRequest<JamSession>(`/jams/${encodeURIComponent(code)}/state`, {
    method: 'PUT',
    json: true,
    body: JSON.stringify(payload),
  });
}

export function updateJamSettings(code: string, payload: JamSettingsPayload) {
  return apiRequest<JamSession>(`/jams/${encodeURIComponent(code)}/settings`, {
    method: 'PUT',
    json: true,
    body: JSON.stringify(payload),
  });
}

export function addJamQueueSong(code: string, song: JamSong) {
  return apiRequest<JamSession>(`/jams/${encodeURIComponent(code)}/queue`, {
    method: 'POST',
    json: true,
    body: JSON.stringify({
      song,
      positionSeconds: 0,
      playing: false,
    }),
  });
}

export function leaveJam(code: string) {
  return apiRequest<void>(`/jams/${encodeURIComponent(code)}/leave`, {
    method: 'POST',
  });
}

export async function syncToJamSession(session: JamSession) {
  const state = session.state;
  if (!state?.song?.sourceId) return;

  const current = getActiveMediaItemSafely();
  const currentSourceId = stringValue(extrasOf(current).sourceId) || stringValue(current?.mediaId);
  const targetSourceId = state.song.sourceId || state.song.id;
  const sameSong = currentSourceId === targetSourceId;

  if (!sameSong) {
    await playSongQueue([jamSongToMusicSong(state.song)], 0);
  }

  const nowOffset = state.playing
    ? Math.max(0, (session.serverTime - state.updatedAt) / 1000)
    : 0;
  const predictedPosition = Math.max(0, state.positionSeconds + nowOffset);
  const progress = getPlayerProgressSafely();
  const duration = Number(progress.duration) || 0;
  const targetPosition = duration > 0
    ? Math.min(predictedPosition, Math.max(0, duration - 1))
    : predictedPosition;

  if (!sameSong || Math.abs((Number(progress.position) || 0) - targetPosition) > 2.5) {
    try {
      TrackPlayer.seekTo(targetPosition);
    } catch {}
  }

  try {
    if (state.playing && !TrackPlayer.isPlaying()) TrackPlayer.play();
    if (!state.playing && TrackPlayer.isPlaying()) TrackPlayer.pause();
    if (session.permissions?.syncVolume) {
      TrackPlayer.setVolume(Math.max(0, Math.min(1, Number(session.volumeLevel ?? state.volumeLevel ?? 1))));
    }
  } catch {}
}

export function stopJamSync() {
  if (hostTimer) clearInterval(hostTimer);
  if (followTimer) clearInterval(followTimer);
  hostTimer = null;
  followTimer = null;
  hostInFlight = false;
  followInFlight = false;
  currentJamCode = '';
}

export function getCurrentJamCode() {
  return currentJamCode;
}

export function startHostingJam(code: string, listener?: SessionListener) {
  stopJamSync();
  currentJamCode = code;

  const publish = async () => {
    if (hostInFlight) return;
    const payload = readCurrentJamState();
    if (!payload) return;

    hostInFlight = true;
    try {
      const session = await updateJamState(code, payload);
      listener?.(session);
    } catch {
    } finally {
      hostInFlight = false;
    }
  };

  void publish();
  hostTimer = setInterval(() => {
    void publish();
  }, 2500);
}

export function startFollowingJam(code: string, listener?: SessionListener) {
  stopJamSync();
  currentJamCode = code;

  const poll = async () => {
    if (followInFlight) return;
    followInFlight = true;
    try {
      const session = await getJam(code);
      listener?.(session);
      await syncToJamSession(session);
    } catch {
    } finally {
      followInFlight = false;
    }
  };

  void poll();
  followTimer = setInterval(() => {
    void poll();
  }, 2500);
}

export function publishCurrentJamState(code: string) {
  const payload = readCurrentJamState();
  if (!payload) throw new Error('Toque uma musica antes de atualizar a JAM.');
  return updateJamState(code, payload);
}

export function addCurrentTrackToJamQueue(code: string) {
  const activeItem = getActiveMediaItemSafely();
  const song = mediaItemToJamSong(activeItem);
  if (!song) throw new Error('Toque uma musica antes de enviar para a fila.');
  return addJamQueueSong(code, song);
}
