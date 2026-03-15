import TrackPlayer, { Event } from 'react-native-track-player';

import { setupPlayer, skipToRelative } from './playerSetup';

export default async function PlaybackService() {
  const runWithRecovery = async (action: () => Promise<void>) => {
    try {
      await action();
      return;
    } catch {}

    try {
      await setupPlayer();
      await action();
    } catch {}
  };

  const safe = (action: () => Promise<void>) => async () => {
    await runWithRecovery(action);
  };

  const safeWithPayload = <T>(action: (payload: T) => Promise<void>) => async (payload: T) => {
    await runWithRecovery(() => action(payload));
  };

  TrackPlayer.addEventListener(Event.RemotePlay, safe(async () => {
    await TrackPlayer.setPlayWhenReady(true);
    await TrackPlayer.play();
  }));
  TrackPlayer.addEventListener(Event.RemotePause, safe(async () => {
    await TrackPlayer.setPlayWhenReady(false);
    await TrackPlayer.pause();
  }));
  TrackPlayer.addEventListener(Event.RemoteNext, safe(async () => {
    try {
      await TrackPlayer.skipToNext();
    } catch {
      await skipToRelative(1);
      return;
    }

    await TrackPlayer.setPlayWhenReady(true);
    await TrackPlayer.play();
  }));
  TrackPlayer.addEventListener(Event.RemotePrevious, safe(async () => {
    try {
      await TrackPlayer.skipToPrevious();
    } catch {
      await skipToRelative(-1);
      return;
    }

    await TrackPlayer.setPlayWhenReady(true);
    await TrackPlayer.play();
  }));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, safeWithPayload(async ({ interval }) => {
    if (typeof interval !== 'number') return;
    await TrackPlayer.seekBy(interval);
  }));
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, safeWithPayload(async ({ interval }) => {
    if (typeof interval !== 'number') return;
    await TrackPlayer.seekBy(-interval);
  }));
  TrackPlayer.addEventListener(Event.RemoteSkip, safeWithPayload(async ({ index }) => {
    if (typeof index !== 'number') return;
    await TrackPlayer.skip(index);
    await TrackPlayer.setPlayWhenReady(true);
    await TrackPlayer.play();
  }));
  TrackPlayer.addEventListener(Event.RemoteSeek, safeWithPayload(async ({ position }) => {
    if (typeof position !== 'number') return;
    await TrackPlayer.seekTo(position);
  }));
  TrackPlayer.addEventListener(Event.RemoteStop, safe(async () => {
    await TrackPlayer.setPlayWhenReady(false);
    await TrackPlayer.stop();
  }));
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    try {
      if (event.permanent || event.paused) {
        await TrackPlayer.pause();
      }
    } catch {}
  });
}