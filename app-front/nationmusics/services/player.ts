import TrackPlayer, {
  PlayerCommand,
  RepeatMode,
  type MediaItem,
} from '@rntp/player';

import type { MusicSong } from '../types/music';
import { getAuthenticatedHeaders } from './api';
import { musicDownloadUrl } from './config';

let initialized = false;

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
