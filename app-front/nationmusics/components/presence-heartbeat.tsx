import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useIsPlaying, useProgress } from '@rntp/player';

import { getCurrentJamCode, mediaItemToJamSong } from '../services/jam';
import { clearFriendPresence, updateFriendPresence } from '../services/friends';
import { useSyncedActiveMediaItem } from '../services/player-state';
import { reportPlayback } from '../services/recommendations';

const HEARTBEAT_MS = 20_000;

export function PresenceHeartbeat() {
  const activeItem = useSyncedActiveMediaItem(3000);
  const isPlaying = useIsPlaying();
  const progress = useProgress(5);
  const latestRef = useRef({ activeItem, isPlaying, position: progress.position });
  const inFlightRef = useRef(false);
  const listeningRef = useRef<{
    songId?: number;
    sourceId?: string;
    position: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    latestRef.current = {
      activeItem,
      isPlaying,
      position: progress.position,
    };
  }, [activeItem, isPlaying, progress.position]);

  useEffect(() => {
    const extras = activeItem?.extras && typeof activeItem.extras === 'object' ? activeItem.extras : {};
    const sourceId = typeof extras.sourceId === 'string' ? extras.sourceId.trim() : '';
    const parsedSongId = Number(extras.songId);
    const songId = Number.isFinite(parsedSongId) ? parsedSongId : undefined;
    const identity = sourceId || (songId ? String(songId) : '');
    const previous = listeningRef.current;
    const previousIdentity = previous?.sourceId || (previous?.songId ? String(previous.songId) : '');

    if (previous && previousIdentity && previousIdentity !== identity) {
      const listenedSeconds = Math.max(0, Math.round(previous.position));
      const completed = previous.duration > 0 && previous.position / previous.duration >= 0.8;
      void reportPlayback({
        songId: previous.songId,
        sourceId: previous.sourceId,
        listenedSeconds,
        completed,
      }).catch(() => {});
    }

    listeningRef.current = identity
      ? {
          songId,
          sourceId: sourceId || undefined,
          position: Math.max(0, Number(progress.position) || 0),
          duration: Math.max(0, Number(progress.duration) || 0),
        }
      : null;
  }, [activeItem, progress.duration, progress.position]);

  useEffect(() => {
    let mounted = true;

    const send = async () => {
      if (!mounted || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const latest = latestRef.current;
        const song = mediaItemToJamSong(latest.activeItem);
        await updateFriendPresence({
          song,
          playing: Boolean(latest.isPlaying && song),
          positionSeconds: Math.max(0, Number(latest.position) || 0),
          activeJamCode: getCurrentJamCode(),
        });
      } catch {
      } finally {
        inFlightRef.current = false;
      }
    };

    void send();
    const timer = setInterval(() => {
      void send();
    }, HEARTBEAT_MS);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void send();
    });

    return () => {
      mounted = false;
      clearInterval(timer);
      appStateSub.remove();
      clearFriendPresence().catch(() => {});
    };
  }, []);

  return null;
}
