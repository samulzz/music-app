import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import TrackPlayer, {
  Event,
  useActiveMediaItem,
  type MediaItem,
} from '@rntp/player';

export function getActiveMediaItemSafely(): MediaItem | null {
  try {
    return TrackPlayer.getActiveMediaItem();
  } catch {
    return null;
  }
}

export function getPlayerProgressSafely() {
  try {
    return TrackPlayer.getProgress();
  } catch {
    return { position: 0, duration: 0, buffered: 0, cached: 0 };
  }
}

export function isPlayerPlayingSafely() {
  try {
    return TrackPlayer.isPlaying();
  } catch {
    return false;
  }
}

export function useSyncedActiveMediaItem(pollMs = 1500): MediaItem | null {
  const hookActiveItem = useActiveMediaItem();
  const [activeItem, setActiveItem] = useState<MediaItem | null>(() =>
    hookActiveItem || getActiveMediaItemSafely()
  );

  useEffect(() => {
    setActiveItem(hookActiveItem || getActiveMediaItemSafely());
  }, [hookActiveItem]);

  useEffect(() => {
    const refresh = (item?: MediaItem | null) => {
      setActiveItem(item || getActiveMediaItemSafely());
    };

    const transitionSub = TrackPlayer.addEventListener(Event.MediaItemTransition, (event) => {
      refresh(event.item || null);
    });
    const metadataSub = TrackPlayer.addEventListener(Event.MediaMetadataChanged, () => refresh());
    const queueSub = TrackPlayer.addEventListener(Event.QueueChanged, () => refresh());

    let timer: ReturnType<typeof setInterval> | null = null;
    const stopTimer = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const startTimer = () => {
      stopTimer();
      refresh();
      timer = setInterval(refresh, pollMs);
    };

    if (AppState.currentState === 'active') startTimer();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') startTimer();
      else stopTimer();
    });

    return () => {
      stopTimer();
      appStateSub.remove();
      transitionSub.remove();
      metadataSub.remove();
      queueSub.remove();
    };
  }, [pollMs]);

  return activeItem;
}
