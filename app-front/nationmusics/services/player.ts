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
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import type { MusicSong } from '../types/music';
import { apiRequest, getMediaHeaders } from './api';
import { musicDownloadUrl, musicPreparePath } from './config';
import { mergeWithOfflineLibrary } from './offline-library';
import { getDailyMixSongs } from './recommendations';
import { sortSongsAlphabetically } from './song-order';
import { getLatestConnectState, markConnectRevisionProcessed, takeOverConnectPlayback } from './connect';
import type { PlaybackContext } from './connect';

let initialized = false;
const OFFLINE_INDEX_KEY = 'nationmusics.offline-library.v2';
const PLAYBACK_SESSION_KEY = 'nationmusics.playback-session.v1';
const PLAYBACK_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PREFETCH_RETRY_MS = 5 * 60 * 1000;
const PREFETCH_AHEAD_COUNT = 2;
const prefetchAttemptAt = new Map<string, number>();
const shuffleListeners = new Set<(enabled: boolean) => void>();
let lastShuffleEnabled = false;
let recommendationAppendInFlight: Promise<void> | null = null;
let recommendationSeedInFlight: Promise<void> | null = null;
let playbackRecoveryInFlight: Promise<void> | null = null;
const lastRecoveryAt = new Map<string, number>();
let playbackQueueRevision = 0;
let playbackTelemetry: { sessionId: string; song: MusicSong; startedAt: number; ready: boolean; lastWaitingAt: number } | null = null;
let playbackContext: PlaybackContext | null = null;
let playbackSessionPersistTimer: ReturnType<typeof setTimeout> | null = null;
let playbackSessionRestoring = false;

type PersistedPlaybackItem = {
  song: MusicSong;
  queueOrigin: MusicSong['queueOrigin'];
  queueSequence: number;
};

type PersistedPlaybackSession = {
  savedAt: number;
  queue: PersistedPlaybackItem[];
  queueIndex: number;
  positionSeconds: number;
  wasPlaying: boolean;
  volume: number;
  shuffle: boolean;
  context: PlaybackContext | null;
};

function persistedItem(item: MediaItem, index: number): PersistedPlaybackItem {
  const extras = item.extras && typeof item.extras === 'object' ? item.extras : {};
  return {
    song: {
      id: String(extras.songId || item.mediaId || ''),
      sourceId: typeof extras.sourceId === 'string' ? extras.sourceId : String(item.mediaId || ''),
      title: item.title || 'Música',
      artist: item.artist || 'Artista desconhecido',
      artworkUrl: typeof item.artworkUrl === 'string' ? item.artworkUrl : undefined,
      localUri: typeof extras.localUri === 'string' ? extras.localUri : undefined,
      album: typeof extras.album === 'string' ? extras.album : undefined,
      albumArtist: typeof extras.albumArtist === 'string' ? extras.albumArtist : undefined,
      genres: Array.isArray(extras.genres) ? extras.genres.filter((genre): genre is string => typeof genre === 'string') : [],
      queueOrigin: extras.queueOrigin as MusicSong['queueOrigin'],
    },
    queueOrigin: (extras.queueOrigin as MusicSong['queueOrigin']) || 'playlist',
    queueSequence: typeof extras.queueSequence === 'number' ? extras.queueSequence : index,
  };
}

async function persistPlaybackSessionNow() {
  if (!initialized || playbackSessionRestoring) return;
  if (playbackSessionPersistTimer) clearTimeout(playbackSessionPersistTimer);
  playbackSessionPersistTimer = null;
  const queue = TrackPlayer.getQueue();
  const queueIndex = TrackPlayer.getActiveMediaItemIndex();
  if (!queue.length || queueIndex === null || queueIndex < 0) return;
  const session: PersistedPlaybackSession = {
    savedAt: Date.now(),
    queue: queue.slice(0, 250).map(persistedItem),
    queueIndex,
    positionSeconds: Math.max(0, TrackPlayer.getProgress().position || 0),
    wasPlaying: TrackPlayer.isPlaying(),
    volume: Math.max(0, Math.min(1, Number(TrackPlayer.getVolume()) || 0)),
    shuffle: lastShuffleEnabled,
    context: playbackContext,
  };
  await AsyncStorage.setItem(PLAYBACK_SESSION_KEY, JSON.stringify(session));
}

function schedulePersistPlaybackSession(delay = 350) {
  if (playbackSessionRestoring) return;
  if (playbackSessionPersistTimer) clearTimeout(playbackSessionPersistTimer);
  playbackSessionPersistTimer = setTimeout(() => { void persistPlaybackSessionNow().catch(() => {}); }, delay);
}

async function restorePersistedPlaybackSession(expectedRevision: number) {
  if (TrackPlayer.getQueue().length) {
    schedulePersistPlaybackSession();
    return;
  }
  playbackSessionRestoring = true;
  try {
    const raw = await AsyncStorage.getItem(PLAYBACK_SESSION_KEY);
    const session = raw ? JSON.parse(raw) as PersistedPlaybackSession : null;
    if (!session || Date.now() - Number(session.savedAt || 0) > PLAYBACK_SESSION_MAX_AGE_MS) return;
    if (expectedRevision !== playbackQueueRevision || TrackPlayer.getQueue().length || !Array.isArray(session.queue) || !session.queue.length) return;
    const needsNetwork = session.queue.some(({ song }) => !song.localUri && Boolean(song.sourceId || song.remoteUrl));
    const headers = needsNetwork ? await getMediaHeaders() : undefined;
    if (expectedRevision !== playbackQueueRevision || TrackPlayer.getQueue().length) return;
    const items = session.queue
      .map(({ song, queueOrigin: origin, queueSequence: sequence }) => {
        const item = toMediaItem(song, headers, origin);
        if (item) item.extras = { ...item.extras, queueOrigin: origin, queueSequence: sequence };
        return item;
      })
      .filter((item): item is MediaItem => item !== null);
    if (!items.length) return;
    const index = Math.max(0, Math.min(items.length - 1, Number(session.queueIndex) || 0));
    playbackQueueRevision += 1;
    playbackContext = session.context || null;
    emitShuffleEnabled(Boolean(session.shuffle));
    TrackPlayer.setVolume(Math.max(0, Math.min(1, Number(session.volume) || 0)));
    TrackPlayer.setMediaItems(items, index);
    if (Number(session.positionSeconds) > 0) TrackPlayer.seekTo(Number(session.positionSeconds));
    // Uma restauração fria sempre volta pausada para o app nunca começar sozinho.
    TrackPlayer.pause();
    prefetchNextInQueue(index);
  } catch {
    // O app continua normalmente quando não existe sessão válida para restaurar.
  } finally {
    playbackSessionRestoring = false;
    schedulePersistPlaybackSession();
  }
}

function telemetrySong(item: MediaItem): MusicSong {
  const extras = item.extras && typeof item.extras === 'object' ? item.extras : {};
  return {
    id: String(extras.songId || item.mediaId || ''),
    sourceId: typeof extras.sourceId === 'string' ? extras.sourceId : String(item.mediaId || ''),
    title: item.title || 'Música',
    artist: item.artist || 'Artista desconhecido',
    artworkUrl: typeof item.artworkUrl === 'string' ? item.artworkUrl : '',
  };
}

function sendPlaybackTelemetry(eventType: string, details: { loadTimeMs?: number; message?: string } = {}) {
  if (!playbackTelemetry) return;
  const { song, sessionId } = playbackTelemetry;
  void apiRequest('/telemetry/events', {
    method: 'POST',
    json: true,
    body: JSON.stringify({
      sessionId,
      songId: Number.isFinite(Number(song.id)) ? Number(song.id) : null,
      sourceId: song.sourceId || '',
      title: song.title,
      artist: song.artist,
      eventType,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version || '',
      loadTimeMs: details.loadTimeMs ?? null,
      positionSeconds: TrackPlayer.getProgress().position,
      message: details.message || '',
    }),
  }).catch(() => {});
}

function beginPlaybackTelemetry(item: MediaItem | null) {
  if (!item) return;
  playbackTelemetry = {
    sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`,
    song: telemetrySong(item),
    startedAt: Date.now(),
    ready: false,
    lastWaitingAt: 0,
  };
  sendPlaybackTelemetry('LOAD_STARTED');
}

function queueOrigin(item: MediaItem) {
  return item.extras && typeof item.extras === 'object' ? item.extras.queueOrigin : undefined;
}

function queueSequence(item: MediaItem) {
  const value = item.extras && typeof item.extras === 'object' ? item.extras.queueSequence : undefined;
  return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER;
}

function shuffled<T>(items: T[]) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function reorderUpcomingQueue() {
  const activeIndex = TrackPlayer.getActiveMediaItemIndex();
  const queue = TrackPlayer.getQueue();
  if (activeIndex === null || activeIndex < 0 || activeIndex >= queue.length - 1) return;
  const start = activeIndex + 1;
  let manualEnd = start;
  while (manualEnd < queue.length && queueOrigin(queue[manualEnd]) === 'manual') manualEnd += 1;
  const future = queue.slice(manualEnd);
  if (future.length < 2) return;
  const reordered = lastShuffleEnabled
    ? shuffled(future)
    : [...future].sort((left, right) => queueSequence(left) - queueSequence(right));
  TrackPlayer.removeMediaItems(manualEnd, queue.length);
  TrackPlayer.insertMediaItems(manualEnd, reordered);
}

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
        preloading: { window: PREFETCH_AHEAD_COUNT },
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
  TrackPlayer.setShuffleEnabled(false);
  TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item }) => {
    beginPlaybackTelemetry(item);
    prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
    schedulePersistPlaybackSession();
  });
  TrackPlayer.addEventListener(Event.QueueChanged, () => schedulePersistPlaybackSession());
  TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
    if (state === PlaybackState.Ready && playbackTelemetry && !playbackTelemetry.ready) {
      playbackTelemetry.ready = true;
      sendPlaybackTelemetry('READY', { loadTimeMs: Date.now() - playbackTelemetry.startedAt });
    } else if (state === PlaybackState.Buffering && playbackTelemetry?.ready) {
      const now = Date.now();
      if (now - playbackTelemetry.lastWaitingAt >= 8_000) {
        playbackTelemetry.lastWaitingAt = now;
        sendPlaybackTelemetry('WAITING');
      }
    } else if (state === PlaybackState.Error) {
      sendPlaybackTelemetry('ERROR', { message: 'O player nativo informou erro de reprodução.' });
      void recoverActivePlayback();
    }
    schedulePersistPlaybackSession();
    if (state !== PlaybackState.Ended) return;
    sendPlaybackTelemetry('ENDED');
    const revision = playbackQueueRevision;
    void continueWithDailyRecommendations(revision);
  });
  TrackPlayer.addEventListener(Event.PlaybackError, ({ code, message }) => {
    sendPlaybackTelemetry('ERROR', { message: `${code}: ${message}` });
    void recoverActivePlayback();
  });
  initialized = true;
  const restoreRevision = playbackQueueRevision;
  void restorePersistedPlaybackSession(restoreRevision);
  AppState.addEventListener('change', (nextState) => {
    if (nextState !== 'active') void persistPlaybackSessionNow().catch(() => {});
  });
  setInterval(() => schedulePersistPlaybackSession(0), 5_000);
}

function toMediaItem(song: MusicSong, headers?: Record<string, string>, origin: MusicSong['queueOrigin'] = 'manual'): MediaItem | null {
  const sourceId = song.sourceId?.trim();
  // URLs vindas de uma sessão anterior podem carregar cabeçalhos expirados.
  // Com sourceId, sempre recria a URL canônica usando a sessão atual.
  const remoteUrl = sourceId ? musicDownloadUrl(sourceId, song.title, song.artist) : song.remoteUrl || '';
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
      album: song.album,
      albumArtist: song.albumArtist,
      genres: song.genres || [],
      queueOrigin: song.queueOrigin || origin,
    },
  };
}

function primaryArtist(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/\s*(?:,|\bfeat\.?\b|\bft\.?\b|\s+&\s+)\s*/i)[0].trim();
}

function normalizedGenre(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function recommendationAffinity(anchor: MusicSong, candidate: MusicSong) {
  let score = primaryArtist(anchor.artist) === primaryArtist(candidate.artist) ? 100 : 0;
  const genres = new Set((anchor.genres || []).map(normalizedGenre));
  score += (candidate.genres || []).map(normalizedGenre).filter((genre) => genres.has(genre)).length * 35;
  return score;
}

async function seedRecommendationsForSingleSong(anchor: MusicSong, expectedRevision: number) {
  if (recommendationSeedInFlight) return recommendationSeedInFlight;
  recommendationSeedInFlight = (async () => {
    try {
      const dailySongs = await mergeWithOfflineLibrary(await getDailyMixSongs());
      if (expectedRevision !== playbackQueueRevision || TrackPlayer.getQueue().length !== 1) return;
      const existing = new Set(TrackPlayer.getQueue().map((item) => mediaItemSourceId(item) || String(item.mediaId || '')));
      const needsNetwork = dailySongs.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
      const headers = needsNetwork ? await getMediaHeaders() : undefined;
      const additions = dailySongs
        .map((song, order) => ({ song, order, score: recommendationAffinity(anchor, song) }))
        .filter(({ song }) => {
          const identity = song.sourceId?.trim() || song.id;
          if (!identity || existing.has(identity)) return false;
          existing.add(identity);
          return true;
        })
        .sort((left, right) => right.score - left.score || left.order - right.order)
        .slice(0, 30)
        .map(({ song }, index) => {
          const item = toMediaItem(song, headers, 'recommendation');
          if (item) item.extras = { ...item.extras, queueSequence: index + 1 };
          return item;
        })
        .filter((item): item is MediaItem => item !== null);
      if (expectedRevision !== playbackQueueRevision || !additions.length) return;
      TrackPlayer.addMediaItems(additions);
      prefetchNextInQueue(0);
      schedulePersistPlaybackSession();
    } catch {
      // Mantém a faixa escolhida quando as recomendações estiverem indisponíveis.
    } finally {
      recommendationSeedInFlight = null;
    }
  })();
  return recommendationSeedInFlight;
}

async function recoverActivePlayback() {
  if (playbackRecoveryInFlight) return playbackRecoveryInFlight;
  playbackRecoveryInFlight = (async () => {
    const index = TrackPlayer.getActiveMediaItemIndex();
    const queue = TrackPlayer.getQueue();
    if (index === null || index < 0 || index >= queue.length) return;
    const item = queue[index];
    const sourceId = mediaItemSourceId(item);
    if (!sourceId || (item.extras && typeof item.extras === 'object' && item.extras.localUri)) return;
    const previous = lastRecoveryAt.get(sourceId) || 0;
    if (Date.now() - previous < 15_000) return;
    lastRecoveryAt.set(sourceId, Date.now());
    const position = TrackPlayer.getProgress().position;
    const headers = await getMediaHeaders();
    const freshUrl = musicDownloadUrl(sourceId, String(item.title || 'Música'), String(item.artist || ''));
    const refreshed = [...queue];
    refreshed[index] = { ...item, url: { uri: freshUrl, headers } };
    playbackQueueRevision += 1;
    TrackPlayer.setMediaItems(refreshed, index);
    if (position > 0) TrackPlayer.seekTo(position);
    TrackPlayer.play();
    prefetchNextInQueue(index);
    schedulePersistPlaybackSession();
  })().catch(() => {}).finally(() => { playbackRecoveryInFlight = null; });
  return playbackRecoveryInFlight;
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

function prefetchNextInQueue(currentIndex = TrackPlayer.getActiveMediaItemIndex()) {
  const queue = TrackPlayer.getQueue();
  if (currentIndex === null || currentIndex < 0 || queue.length <= 1) return;
  for (let offset = 1; offset <= PREFETCH_AHEAD_COUNT; offset += 1) {
    const index = currentIndex + offset;
    if (index >= queue.length) break;
    prefetchMediaItem(queue[index]);
  }
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
        const arranged = lastShuffleEnabled ? shuffled(additions) : additions;
        const firstRecommendationIndex = endedQueue.length;
        playbackQueueRevision += 1;
        TrackPlayer.addMediaItems(arranged);
        TrackPlayer.skipToIndex(firstRecommendationIndex);
        TrackPlayer.play();
        prefetchNextInQueue(firstRecommendationIndex);
        schedulePersistPlaybackSession();
      }
    } catch {
      // A fila original continua funcionando quando o usuário estiver offline.
    } finally {
      recommendationAppendInFlight = null;
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

export async function playSongQueue(
  songs: MusicSong[],
  requestedIndex: number,
  origin: MusicSong['queueOrigin'] = 'playlist',
  context: PlaybackContext | null = null,
) {
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
    item.extras = { ...item.extras, queueSequence: index };
    queue.push(item);
  });

  if (queueIndex < 0 || !queue.length) {
    throw new Error('Esta música não está disponível sem internet. Baixe-a antes de sair da rede.');
  }

  playbackQueueRevision += 1;
  playbackContext = context;
  const ordered = lastShuffleEnabled
    ? [queue[queueIndex], ...shuffled(queue.filter((_item, index) => index !== queueIndex))]
    : queue;
  const startIndex = lastShuffleEnabled ? 0 : queueIndex;
  TrackPlayer.setMediaItems(ordered, startIndex);
  TrackPlayer.play();
  prefetchNextInQueue(startIndex);
  schedulePersistPlaybackSession();
  if (queue.length === 1) void seedRecommendationsForSingleSong(playableSongs[requestedIndex], playbackQueueRevision);
  return startIndex;
}

export async function restorePausedSongQueue(
  songs: MusicSong[],
  requestedIndex: number,
  positionSeconds: number,
  context: PlaybackContext | null = null,
) {
  setupMusicPlayer();
  if (TrackPlayer.getQueue().length && TrackPlayer.isPlaying()) return false;
  const playableSongs = await mergeWithOfflineLibrary(songs);
  const needsNetwork = playableSongs.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
  const headers = needsNetwork ? await getMediaHeaders() : undefined;
  const queue: MediaItem[] = [];
  let queueIndex = -1;
  playableSongs.forEach((song, index) => {
    if (!song.localUri && !headers) return;
    const item = toMediaItem(song, headers, 'playlist');
    if (!item) return;
    if (index === requestedIndex) queueIndex = queue.length;
    item.extras = { ...item.extras, queueSequence: index };
    queue.push(item);
  });
  if (queueIndex < 0 || !queue.length) return false;
  playbackQueueRevision += 1;
  playbackContext = context;
  TrackPlayer.setMediaItems(queue, queueIndex);
  TrackPlayer.seekTo(Math.max(0, positionSeconds));
  TrackPlayer.pause();
  prefetchNextInQueue(queueIndex);
  schedulePersistPlaybackSession();
  return true;
}

export function getPlaybackContext() { return playbackContext; }

export async function addSongsToPlaybackQueue(songs: MusicSong[]) {
  setupMusicPlayer();
  const prepared = await mergeWithOfflineLibrary(songs);
  const needsNetwork = prepared.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
  const headers = needsNetwork ? await getMediaHeaders() : undefined;
  const items = prepared
    .map((song) => toMediaItem(song, headers, 'manual'))
    .filter((item): item is MediaItem => item !== null)
    .map((item) => ({ ...item, extras: { ...item.extras, queueOrigin: 'manual' } }));
  if (!items.length) throw new Error('Nenhuma música disponível para adicionar à fila.');
  playbackQueueRevision += 1;
  const activeIndex = TrackPlayer.getActiveMediaItemIndex();
  if (activeIndex === null || activeIndex < 0) {
    TrackPlayer.setMediaItems(items, 0);
    TrackPlayer.play();
    schedulePersistPlaybackSession();
    return items.length;
  }
  const queue = TrackPlayer.getQueue();
  let insertAt = activeIndex + 1;
  while (insertAt < queue.length && queueOrigin(queue[insertAt]) === 'manual') insertAt += 1;
  TrackPlayer.insertMediaItems(insertAt, items);
  if (TrackPlayer.getPlaybackState() === PlaybackState.Ended) {
    TrackPlayer.skipToIndex(insertAt);
    TrackPlayer.play();
  }
  prefetchNextInQueue(activeIndex);
  schedulePersistPlaybackSession();
  return items.length;
}

export function getPlaybackQueue() {
  setupMusicPlayer();
  return TrackPlayer.getQueue();
}

export function playQueueIndex(index: number) {
  setupMusicPlayer();
  const current = TrackPlayer.getQueue();
  if (index < 0 || index >= current.length) return;
  TrackPlayer.skipToIndex(index);
  TrackPlayer.play();
  prefetchNextInQueue(index);
  schedulePersistPlaybackSession();
}

export async function togglePlayback() {
  setupMusicPlayer();
  if (TrackPlayer.isPlaying()) {
    TrackPlayer.pause();
  } else if (TrackPlayer.getPlaybackState() === PlaybackState.Error) {
    await recoverActivePlayback();
  } else {
    TrackPlayer.play();
  }
  schedulePersistPlaybackSession();
}

export function seekToPosition(positionSeconds: number) {
  setupMusicPlayer();
  TrackPlayer.seekTo(Math.max(0, positionSeconds));
  schedulePersistPlaybackSession();
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
  schedulePersistPlaybackSession();
}

export function playPrevious() {
  setupMusicPlayer();
  TrackPlayer.skipToPrevious();
  TrackPlayer.play();
  prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
  schedulePersistPlaybackSession();
}

export function stopMusicPlayer(clearQueue = false) {
  if (!initialized) return;
  TrackPlayer.stop();
  if (clearQueue) {
    playbackContext = null;
    playbackQueueRevision += 1;
    TrackPlayer.clear();
    void AsyncStorage.removeItem(PLAYBACK_SESSION_KEY).catch(() => {});
  }
}

export function setShuffleEnabled(enabled: boolean) {
  setupMusicPlayer();
  // A ordem fisica da fila e a mesma exibida ao usuario, inclusive no aleatorio.
  TrackPlayer.setShuffleEnabled(false);
  emitShuffleEnabled(enabled);
  reorderUpcomingQueue();
  prefetchNextInQueue(TrackPlayer.getActiveMediaItemIndex());
  schedulePersistPlaybackSession();
  return enabled;
}

export function getShuffleEnabled() {
  setupMusicPlayer();
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
