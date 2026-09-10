import TrackPlayer, {
  Event,
  PlaybackState,
  PlayerCommand,
  RepeatMode,
  type BrowseCategory,
  type BrowseItem,
  type MediaItem,
} from '@rntp/player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { MusicSong } from '../types/music';
import { apiRequest, getMediaHeaders } from './api';
import { musicDownloadUrl, musicPreparePath } from './config';
import { mergeWithOfflineLibrary } from './offline-library';
import { getDailyMixSongs } from './recommendations';
import { sortSongsAlphabetically } from './song-order';
import { getLatestConnectState, markConnectRevisionProcessed, takeOverConnectPlayback } from './connect';

let initialized = false;
const OFFLINE_INDEX_KEY = 'nationmusics.offline-library.v2';
const PREFETCH_RETRY_MS = 5 * 60 * 1000;
const prefetchAttemptAt = new Map<string, number>();
const shuffleListeners = new Set<(enabled: boolean) => void>();
let lastShuffleEnabled = false;
let recommendationAppendInFlight: Promise<void> | null = null;
let playbackQueueRevision = 0;
let playbackQueueHistory: MediaItem[] = [];

function offlineBrowseItem(song: MusicSong): BrowseItem | null {
  if (!song.localUri) return null;
  return {
    mediaId: `offline:${song.sourceId?.trim() || song.id}`,
    url: song.localUri,
    title: song.title,
    artist: song.artist,
    artworkUrl: song.artworkUrl,
    mimeType: 'audio/mpeg',
    extras: {
      sourceId: song.sourceId,
      songId: song.id,
      localUri: song.localUri,
      origin: 'android-auto',
    },
  };
}

export async function refreshAndroidAutoLibrary() {
  if (Platform.OS !== 'android') return;
  setupMusicPlayer();

  let songs: MusicSong[] = [];
  try {
    const stored = await AsyncStorage.getItem(OFFLINE_INDEX_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    songs = Array.isArray(parsed)
      ? parsed.filter((song): song is MusicSong =>
          Boolean(song && typeof song === 'object' && song.localUri && song.title)
        )
      : [];
  } catch {
    songs = [];
  }

  const orderedSongs = sortSongsAlphabetically(songs);
  const downloaded = orderedSongs
    .map(offlineBrowseItem)
    .filter((item): item is BrowseItem => item !== null);

  const byArtist = new Map<string, BrowseItem[]>();
  orderedSongs.forEach((song) => {
    const item = offlineBrowseItem(song);
    if (!item) return;
    const artist = song.artist?.trim() || 'Artista desconhecido';
    const items = byArtist.get(artist) || [];
    items.push(item);
    byArtist.set(artist, items);
  });

  const artistFolders: BrowseItem[] = [...byArtist.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
    .map(([artist, children]) => ({
      mediaId: `artist:${artist}`,
      title: artist,
      artist: `${children.length} ${children.length === 1 ? 'música' : 'músicas'}`,
      artworkUrl: children.find((item) => item.artworkUrl)?.artworkUrl,
      children: [...children].sort((left, right) =>
        left.title.localeCompare(right.title, 'pt-BR', { sensitivity: 'base', numeric: true })
      ),
    }));

  const categories: BrowseCategory[] = [
    {
      mediaId: 'offline-downloads',
      title: 'Músicas baixadas',
      items: downloaded,
    },
    {
      mediaId: 'offline-artists',
      title: 'Artistas',
      items: artistFolders,
    },
  ];

  TrackPlayer.setBrowseTree(categories);
}

export function setupMusicPlayer() {
  if (initialized) return;

  try {
    TrackPlayer.setupPlayer({
      contentType: 'music',
      handleAudioBecomingNoisy: true,
      audioMixing: 'exclusive',
      cache: {
        maxSizeBytes: 256 * 1024 * 1024,
        preloading: { window: 1 },
      },
      android: {
        wakeMode: 'network',
        taskRemovedBehavior: 'continue',
      },
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already set up')) {
      throw error;
    }
  }

  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Previous,
      PlayerCommand.Next,
      PlayerCommand.Seek,
      PlayerCommand.Stop,
    ],
    handling: 'native',
  });
  // A fila precisa terminar para só então iniciar as recomendações. Com RepeatMode.All,
  // as sugestões precisavam ser anexadas antes e acabavam entrando no aleatório.
  TrackPlayer.setRepeatMode(RepeatMode.Off);
  TrackPlayer.addEventListener(Event.MediaItemTransition, () => {
    prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
  });
  TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
    if (state !== PlaybackState.Ended) return;
    const revision = playbackQueueRevision;
    void continueWithDailyRecommendations(revision);
  });
  initialized = true;
}

function toMediaItem(song: MusicSong, headers?: Record<string, string>, origin: MusicSong['queueOrigin'] = 'manual'): MediaItem | null {
  const sourceId = song.sourceId?.trim();
  const remoteUrl = song.remoteUrl || (sourceId ? musicDownloadUrl(sourceId, song.title, song.artist) : '');
  const url = song.localUri || remoteUrl;
  if (!url) return null;

  return {
    mediaId: sourceId || song.id,
    url: song.localUri || !headers ? url : { uri: url, headers },
    title: song.title,
    artist: song.artist,
    artworkUrl: song.artworkUrl,
    mimeType: 'audio/mpeg',
    extras: {
      sourceId: song.sourceId,
      songId: song.id,
      localUri: song.localUri,
      queueOrigin: song.queueOrigin || origin,
    },
  };
}

function mediaItemSourceId(item: MediaItem | null | undefined) {
  const sourceId = item?.extras && typeof item.extras === 'object' ? item.extras.sourceId : '';
  return typeof sourceId === 'string' ? sourceId.trim() : '';
}

function shouldPrefetch(sourceId: string) {
  if (!sourceId) return false;
  const lastAttempt = prefetchAttemptAt.get(sourceId) || 0;
  if (Date.now() - lastAttempt < PREFETCH_RETRY_MS) return false;
  prefetchAttemptAt.set(sourceId, Date.now());
  return true;
}

function prefetchMediaItem(item: MediaItem | null | undefined) {
  const sourceId = mediaItemSourceId(item);
  const localUri = item?.extras && typeof item.extras === 'object' ? item.extras.localUri : '';
  if (!item || localUri || !shouldPrefetch(sourceId)) return;

  try {
    TrackPlayer.preload(item);
  } catch {}

  void apiRequest(musicPreparePath(sourceId, String(item.title || 'Música'), String(item.artist || '')), {
    method: 'POST',
    authenticated: false,
  }).catch(() => {});
}

function nextPrefetchIndex(currentIndex: number | null, queueLength: number) {
  if (currentIndex === null || currentIndex < 0 || queueLength <= 1) return -1;
  if (!TrackPlayer.isShuffleEnabled()) return (currentIndex + 1) % queueLength;

  let next = currentIndex;
  while (next === currentIndex) {
    next = Math.floor(Math.random() * queueLength);
  }
  return next;
}

function prefetchNextInQueue(currentIndex = TrackPlayer.getActiveMediaItemIndex()) {
  const queue = TrackPlayer.getQueue();
  const index = nextPrefetchIndex(currentIndex, queue.length);
  if (index < 0) return;
  prefetchMediaItem(queue[index]);
}

async function continueWithDailyRecommendations(expectedRevision: number) {
  if (recommendationAppendInFlight) return recommendationAppendInFlight;
  recommendationAppendInFlight = (async () => {
    try {
      const endedQueue = TrackPlayer.getQueue();
      const dailySongs = await mergeWithOfflineLibrary(await getDailyMixSongs());
      if (expectedRevision !== playbackQueueRevision || TrackPlayer.getPlaybackState() !== PlaybackState.Ended) return;
      const existing = new Set(
        endedQueue.map((item) => mediaItemSourceId(item) || String(item.mediaId || ''))
      );
      const needsNetwork = dailySongs.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
      const headers = needsNetwork ? await getMediaHeaders() : undefined;
      const additions = dailySongs
        .filter((song) => {
          const identity = song.sourceId?.trim() || song.id;
          if (!identity || existing.has(identity)) return false;
          existing.add(identity);
          return true;
        })
        .map((song) => toMediaItem(song, headers, 'recommendation'))
        .filter((item): item is MediaItem => item !== null);
      if (additions.length) {
        // A playlist original já terminou. Começamos outra fila para que músicas
        // recomendadas nunca sejam misturadas ao aleatório da seleção original.
        playbackQueueRevision += 1;
        playbackQueueHistory = [...endedQueue, ...additions];
        TrackPlayer.setMediaItems(additions, 0);
        TrackPlayer.play();
        prefetchNextInQueue(0);
      }
    } catch {
      // A fila original continua funcionando quando o usuário estiver offline.
    } finally {
      recommendationAppendInFlight = null;
      if (expectedRevision !== playbackQueueRevision && TrackPlayer.getPlaybackState() === PlaybackState.Ended) {
        queueMicrotask(() => { void continueWithDailyRecommendations(playbackQueueRevision); });
      }
    }
  })();
  return recommendationAppendInFlight;
}

function emitShuffleEnabled(enabled: boolean) {
  lastShuffleEnabled = enabled;
  shuffleListeners.forEach((listener) => {
    try {
      listener(enabled);
    } catch {}
  });
}

export async function playSongQueue(songs: MusicSong[], requestedIndex: number, origin: MusicSong['queueOrigin'] = 'playlist') {
  setupMusicPlayer();
  if (getLatestConnectState() && !getLatestConnectState()?.currentDeviceActive) {
    try {
      const state = await takeOverConnectPlayback();
      markConnectRevisionProcessed(state.commandRevision);
    } catch {}
  }
  const playableSongs = await mergeWithOfflineLibrary(songs);

  const needsNetwork = playableSongs.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
  let headers: Record<string, string> | undefined;
  if (needsNetwork) {
    headers = await getMediaHeaders();
  }

  const queue: MediaItem[] = [];
  let queueIndex = -1;

  playableSongs.forEach((song, index) => {
    if (!song.localUri && !headers) return;
    const item = toMediaItem(song, headers, origin);
    if (!item) return;
    if (index === requestedIndex) queueIndex = queue.length;
    queue.push(item);
  });

  if (queueIndex < 0 || !queue.length) {
    throw new Error('Esta música não está disponível sem internet. Baixe-a antes de sair da rede.');
  }

  playbackQueueRevision += 1;
  TrackPlayer.setMediaItems(queue, queueIndex);
  playbackQueueHistory = [...queue];
  TrackPlayer.play();
  prefetchNextInQueue(queueIndex);
  return queueIndex;
}

export function getPlaybackQueue() {
  setupMusicPlayer();
  return playbackQueueHistory.length ? [...playbackQueueHistory] : TrackPlayer.getQueue();
}

export function playQueueIndex(index: number) {
  setupMusicPlayer();
  const selected = playbackQueueHistory[index];
  const current = TrackPlayer.getQueue();
  const actualIndex = selected
    ? current.findIndex((item) => String(item.mediaId) === String(selected.mediaId))
    : index;
  if (actualIndex < 0) return;
  TrackPlayer.skipToIndex(actualIndex);
  TrackPlayer.play();
  prefetchNextInQueue(index);
}

export function togglePlayback() {
  setupMusicPlayer();
  if (TrackPlayer.isPlaying()) {
    TrackPlayer.pause();
  } else {
    TrackPlayer.play();
  }
}

export function seekToPosition(positionSeconds: number) {
  setupMusicPlayer();
  TrackPlayer.seekTo(Math.max(0, positionSeconds));
}

export function setPlaybackSleepTimer(minutes: number) {
  setupMusicPlayer();
  TrackPlayer.sleepAfterTime(Math.max(1, Math.round(minutes * 60)), { fadeOutSeconds: 5 });
}

export function getPlaybackSleepTimerRemaining() {
  setupMusicPlayer();
  const timer = TrackPlayer.getSleepTimer();
  return timer?.type === 'time' ? Math.max(0, Math.ceil(timer.remainingSeconds)) : null;
}

export function clearPlaybackSleepTimer() {
  setupMusicPlayer();
  TrackPlayer.cancelSleepTimer();
}

export function playNext() {
  setupMusicPlayer();
  TrackPlayer.skipToNext();
  TrackPlayer.play();
  prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
}

export function playPrevious() {
  setupMusicPlayer();
  TrackPlayer.skipToPrevious();
  TrackPlayer.play();
  prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
}

export function stopMusicPlayer(clearQueue = false) {
  if (!initialized) return;
  TrackPlayer.stop();
  if (clearQueue) {
    playbackQueueRevision += 1;
    TrackPlayer.clear();
  }
}

export function setShuffleEnabled(enabled: boolean) {
  setupMusicPlayer();
  TrackPlayer.setShuffleEnabled(enabled);
  emitShuffleEnabled(enabled);
  prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
  return enabled;
}

export function getShuffleEnabled() {
  setupMusicPlayer();
  lastShuffleEnabled = TrackPlayer.isShuffleEnabled();
  return lastShuffleEnabled;
}

export function toggleShuffleEnabled() {
  const enabled = !getShuffleEnabled();
  setShuffleEnabled(enabled);
  return enabled;
}

export function subscribeShuffleEnabled(listener: (enabled: boolean) => void) {
  shuffleListeners.add(listener);
  try {
    listener(getShuffleEnabled());
  } catch {
    listener(lastShuffleEnabled);
  }
  return () => {
    shuffleListeners.delete(listener);
  };
}
