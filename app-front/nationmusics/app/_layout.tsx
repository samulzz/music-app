import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import TrackPlayer, { Event } from 'react-native-track-player';

export default function RootLayout() {
  useEffect(() => {
    const run = (fn: () => Promise<void>) => {
      fn().catch(() => {});
    };

    const subscriptions = [
      TrackPlayer.addEventListener(Event.RemotePlay, () => {
        run(async () => {
          const track = await TrackPlayer.getActiveTrack();
          if (!track) {
            const queue = await TrackPlayer.getQueue();
            if (!queue.length) return;
            await TrackPlayer.skip(0);
          }
          await TrackPlayer.play();
        });
      }),
      TrackPlayer.addEventListener(Event.RemotePause, () => {
        run(async () => {
          await TrackPlayer.pause();
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteNext, () => {
        run(async () => {
          const queue = await TrackPlayer.getQueue();
          if (!queue.length) return;

          const activeIndex = await TrackPlayer.getActiveTrackIndex();
          const baseIndex = activeIndex ?? -1;
          const nextIndex = (baseIndex + 1 + queue.length) % queue.length;

          await TrackPlayer.skip(nextIndex);
          await TrackPlayer.play();
        });
      }),
      TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        run(async () => {
          const queue = await TrackPlayer.getQueue();
          if (!queue.length) return;

          const activeIndex = await TrackPlayer.getActiveTrackIndex();
          const baseIndex = activeIndex ?? 0;
          const nextIndex = (baseIndex - 1 + queue.length) % queue.length;

          await TrackPlayer.skip(nextIndex);
          await TrackPlayer.play();
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteSeek, (event: any) => {
        run(async () => {
          if (typeof event?.position !== 'number') return;
          await TrackPlayer.seekTo(event.position);
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteSkip, (event: any) => {
        run(async () => {
          if (typeof event?.index !== 'number') return;
          await TrackPlayer.skip(event.index);
          await TrackPlayer.play();
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteJumpForward, (event: any) => {
        run(async () => {
          if (typeof event?.interval !== 'number') return;
          await TrackPlayer.seekBy(event.interval);
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteJumpBackward, (event: any) => {
        run(async () => {
          if (typeof event?.interval !== 'number') return;
          await TrackPlayer.seekBy(-event.interval);
        });
      }),
      TrackPlayer.addEventListener(Event.RemoteStop, () => {
        run(async () => {
          await TrackPlayer.stop();
        });
      }),
    ];

    return () => {
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor="#121212" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: '#121212' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}