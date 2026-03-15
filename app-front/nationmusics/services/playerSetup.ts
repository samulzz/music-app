import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from 'react-native-track-player';

export type PlayerSong = {
  id: string;
  nome: string;
  artista: string;
  capa: string;
  isLocal: boolean;
  uriLocal: string;
  sourceId?: string;
};

let setupPromise: Promise<boolean> | null = null;

async function configurePlayer() {
  try {
    await TrackPlayer.getActiveTrackIndex();
  } catch {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });
  }

  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.Stop,
      Capability.SeekTo,
    ],
    compactCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
    ],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.Stop,
      Capability.SeekTo,
    ],
    progressUpdateEventInterval: 1,
  });

  await TrackPlayer.setRepeatMode(RepeatMode.Queue);
  return true;
}

export function setupPlayer() {
  if (!setupPromise) {
    setupPromise = configurePlayer().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }

  return setupPromise;
}

function getLocalSongs(songs: PlayerSong[]) {
  return songs.filter((song) => song.isLocal && song.uriLocal);
}

function mapSongToTrack(song: PlayerSong) {
  return {
    id: song.id,
    url: song.uriLocal,
    title: song.nome,
    artist: song.artista,
    artwork: song.capa || undefined,
    sourceId: song.sourceId,
  };
}

export async function playSongAtIndex(songs: PlayerSong[], songIndex: number) {
  const song = songs[songIndex];
  if (!song?.isLocal) return null;

  const localSongs = getLocalSongs(songs);
  const queueIndex = localSongs.findIndex((candidate) => candidate.id === song.id);
  if (queueIndex < 0) return null;

  await setupPlayer();
  await TrackPlayer.reset();
  await TrackPlayer.add(localSongs.map(mapSongToTrack));
  await TrackPlayer.skip(queueIndex);
  await TrackPlayer.play();

  return queueIndex;
}

export async function skipToRelative(offset: number) {
  await setupPlayer();

  const queue = await TrackPlayer.getQueue();
  if (!queue.length) return;

  const activeIndex = await TrackPlayer.getActiveTrackIndex();
  const baseIndex = activeIndex ?? (offset >= 0 ? -1 : 0);
  const nextIndex = (baseIndex + offset + queue.length) % queue.length;

  await TrackPlayer.skip(nextIndex);
  await TrackPlayer.play();
}

export async function stopPlayer() {
  await setupPlayer();
  await TrackPlayer.reset();
}