import { useEffect, useMemo, useState } from 'react';
import TrackPlayer, { useActiveTrack } from 'react-native-track-player';

type ActiveTrackLike = {
  id?: string | number;
  title?: string;
  artist?: string;
  artwork?: string | number;
  url?: string;
  sourceId?: string;
} | null;

export function useActiveTrackFallback(pollMs = 700) {
  const hookTrack = useActiveTrack() as ActiveTrackLike;
  const [polledTrack, setPolledTrack] = useState<ActiveTrackLike>(null);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      try {
        const track = await TrackPlayer.getActiveTrack();
        if (alive) {
          setPolledTrack((track as ActiveTrackLike) ?? null);
        }
      } catch {
        if (alive) {
          setPolledTrack(null);
        }
      }
    };

    void sync();
    const timer = setInterval(() => {
      void sync();
    }, pollMs);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pollMs]);

  return useMemo(() => hookTrack ?? polledTrack, [hookTrack, polledTrack]);
}
