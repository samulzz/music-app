import { useEffect } from 'react';
import TrackPlayer from '@rntp/player';

import {
  getProcessedConnectRevision,
  markConnectRevisionProcessed,
  sendConnectHeartbeat,
  type ConnectSong,
  type ConnectState,
} from '../services/connect';
import { playNext, playPrevious, playSongQueue } from '../services/player';
import { getActiveMediaItemSafely, getPlayerProgressSafely, isPlayerPlayingSafely } from '../services/player-state';
import { getSession } from '../services/auth';

function localSong(): ConnectSong | null {
  const item = getActiveMediaItemSafely();
  if (!item) return null;
  const extras = item.extras && typeof item.extras === 'object' ? item.extras : {};
  return {
    id: String(extras.songId || item.mediaId || ''),
    sourceId: String(extras.sourceId || item.mediaId || ''),
    title: String(item.title || ''),
    artist: String(item.artist || ''),
    artworkUrl: typeof item.artworkUrl === 'string' ? item.artworkUrl : '',
  };
}

async function applyCommand(state: ConnectState) {
  if (!state.currentDeviceActive || !state.commandAction || state.commandRevision <= getProcessedConnectRevision()) return;
  const action = state.commandAction;
  if (action === 'SYNC' && state.song) {
    const current = localSong();
    if ((current?.sourceId || current?.id) !== (state.song.sourceId || state.song.id)) {
      await playSongQueue([{ ...state.song, id: state.song.id || state.song.sourceId || '' }], 0);
    }
    TrackPlayer.seekTo(Math.max(0, state.positionSeconds));
    TrackPlayer.setVolume(Math.max(0, Math.min(1, state.volumeLevel)));
    if (state.playing) TrackPlayer.play(); else TrackPlayer.pause();
  } else if (action === 'PLAY') TrackPlayer.play();
  else if (action === 'PAUSE') TrackPlayer.pause();
  else if (action === 'NEXT') playNext();
  else if (action === 'PREVIOUS') playPrevious();
  else if (action === 'SEEK') TrackPlayer.seekTo(Math.max(0, state.commandValue));
  else if (action === 'VOLUME') TrackPlayer.setVolume(Math.max(0, Math.min(1, state.commandValue)));
  markConnectRevisionProcessed(state.commandRevision);
}

export function ConnectSync() {
  useEffect(() => {
    let disposed = false;
    let busy = false;
    const synchronize = async () => {
      if (disposed || busy) return;
      busy = true;
      try {
        if (!(await getSession())?.token) return;
        const progress = getPlayerProgressSafely();
        let volume = 1;
        try { volume = Number(TrackPlayer.getVolume()) || 1; } catch {}
        const state = await sendConnectHeartbeat({
          song: localSong(),
          positionSeconds: progress.position,
          durationSeconds: progress.duration,
          playing: isPlayerPlayingSafely(),
          volumeLevel: volume,
        });
        if (!state.currentDeviceActive && isPlayerPlayingSafely()) TrackPlayer.pause();
        await applyCommand(state);
      } catch {
        // A reprodução local continua normalmente quando a conexão estiver offline.
      } finally {
        busy = false;
      }
    };
    void synchronize();
    const timer = setInterval(synchronize, 2500);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  return null;
}
