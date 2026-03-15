const TrackPlayerModule = require('react-native-track-player');
const TrackPlayer = TrackPlayerModule.default ?? TrackPlayerModule;
const { Event } = TrackPlayerModule;

module.exports = async function playbackService() {
  const skipToRelative = async (offset) => {
    const queue = await TrackPlayer.getQueue();
    if (!queue.length) return;

    const activeIndex = await TrackPlayer.getActiveTrackIndex();
    const baseIndex = activeIndex ?? (offset >= 0 ? -1 : 0);
    const nextIndex = (baseIndex + offset + queue.length) % queue.length;

    await TrackPlayer.skip(nextIndex);
    await TrackPlayer.play();
  };

  const safe = (label, action) => async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      console.warn(`[playbackService] ${label} failed`, error);
    }
  };

  const ensureActiveTrack = async () => {
    const track = await TrackPlayer.getActiveTrack();
    if (track) return true;

    const queue = await TrackPlayer.getQueue();
    if (!queue.length) return false;

    await TrackPlayer.skip(0);
    return true;
  };

  TrackPlayer.addEventListener(Event.RemotePlay, safe('RemotePlay', async () => {
    console.warn('[playbackService] RemotePlay received');
    const hasTrack = await ensureActiveTrack();
    if (!hasTrack) return;

    await TrackPlayer.play();
  }));

  TrackPlayer.addEventListener(Event.RemotePause, safe('RemotePause', async () => {
    console.warn('[playbackService] RemotePause received');
    await TrackPlayer.pause();
  }));

  TrackPlayer.addEventListener(Event.RemoteNext, safe('RemoteNext', async () => {
    console.warn('[playbackService] RemoteNext received');
    try {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch {
      await skipToRelative(1);
    }
  }));

  TrackPlayer.addEventListener(Event.RemotePrevious, safe('RemotePrevious', async () => {
    console.warn('[playbackService] RemotePrevious received');
    try {
      await TrackPlayer.skipToPrevious();
      await TrackPlayer.play();
    } catch {
      await skipToRelative(-1);
    }
  }));

  TrackPlayer.addEventListener(Event.RemoteJumpForward, safe('RemoteJumpForward', async ({ interval }) => {
    if (typeof interval !== 'number') return;
    await TrackPlayer.seekBy(interval);
  }));

  TrackPlayer.addEventListener(Event.RemoteJumpBackward, safe('RemoteJumpBackward', async ({ interval }) => {
    if (typeof interval !== 'number') return;
    await TrackPlayer.seekBy(-interval);
  }));

  TrackPlayer.addEventListener(Event.RemoteSkip, safe('RemoteSkip', async ({ index }) => {
    if (typeof index !== 'number') return;
    await TrackPlayer.skip(index);
    await TrackPlayer.play();
  }));

  TrackPlayer.addEventListener(Event.RemoteSeek, safe('RemoteSeek', async ({ position }) => {
    if (typeof position !== 'number') return;
    await TrackPlayer.seekTo(position);
  }));

  TrackPlayer.addEventListener(Event.RemoteStop, safe('RemoteStop', async () => {
    await TrackPlayer.stop();
  }));

  TrackPlayer.addEventListener(Event.RemoteDuck, safe('RemoteDuck', async (event) => {
    if (!event) return;

    if (event.permanent || event.paused) {
      await TrackPlayer.pause();
      return;
    }

    await TrackPlayer.play();
  }));

  // Keep the headless task alive so remote listeners stay attached.
  await new Promise(() => {});
};
