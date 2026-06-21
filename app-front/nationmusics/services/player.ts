import TrackPlayer, {
  PlayerCommand,
  RepeatMode,
  type BrowseCategory,
  type BrowseItem,
  type MediaItem,
} from '@rntp/player';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { MusicSong } from '../types/music';
import { getAuthenticatedHeaders } from './api';
import { musicDownloadUrl } from './config';

let initialized = false;
const OFFLINE_INDEX_KEY = 'nationmusics.offline-library.v2';

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

  const downloaded = songs
    .map(offlineBrowseItem)
    .filter((item): item is BrowseItem => item !== null);

  const byArtist = new Map<string, BrowseItem[]>();
  songs.forEach((song) => {
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
      children,
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
  TrackPlayer.setRepeatMode(RepeatMode.All);
  initialized = true;
}

function toMediaItem(song: MusicSong, headers?: Record<string, string>): MediaItem | null {
  const sourceId = song.sourceId?.trim();
  const remoteUrl = song.remoteUrl || (sourceId ? musicDownloadUrl(sourceId, song.title) : '');
  const url = song.localUri || remoteUrl;
  if (!url) return null;

  return {
    mediaId: song.id,
    url: song.localUri || !headers ? url : { uri: url, headers },
    title: song.title,
    artist: song.artist,
    artworkUrl: song.artworkUrl,
    mimeType: 'audio/mpeg',
    extras: {
      sourceId: song.sourceId,
      localUri: song.localUri,
    },
  };
}

export async function playSongQueue(songs: MusicSong[], requestedIndex: number) {
  setupMusicPlayer();

  const needsNetwork = songs.some((song) => !song.localUri && (song.sourceId || song.remoteUrl));
  let headers: Record<string, string> | undefined;
  if (needsNetwork) {
    try {
      headers = await getAuthenticatedHeaders();
    } catch {}
  }

  const queue: MediaItem[] = [];
  let queueIndex = -1;

  songs.forEach((song, index) => {
    if (!song.localUri && !headers) return;
    const item = toMediaItem(song, headers);
    if (!item) return;
    if (index === requestedIndex) queueIndex = queue.length;
    queue.push(item);
  });

  if (queueIndex < 0 || !queue.length) {
    throw new Error('Esta música não está disponível sem internet. Baixe-a antes de sair da rede.');
  }

  TrackPlayer.setMediaItems(queue, queueIndex);
  TrackPlayer.play();
  return queueIndex;
}

export function togglePlayback() {
  setupMusicPlayer();
  if (TrackPlayer.isPlaying()) {
    TrackPlayer.pause();
  } else {
    TrackPlayer.play();
  }
}

export function playNext() {
  setupMusicPlayer();
  TrackPlayer.skipToNext();
  TrackPlayer.play();
}

export function playPrevious() {
  setupMusicPlayer();
  TrackPlayer.skipToPrevious();
  TrackPlayer.play();
}

export function stopMusicPlayer(clearQueue = false) {
  if (!initialized) return;
  TrackPlayer.stop();
  if (clearQueue) TrackPlayer.clear();
}

export function setShuffleEnabled(enabled: boolean) {
  setupMusicPlayer();
  TrackPlayer.setShuffleEnabled(enabled);
}
