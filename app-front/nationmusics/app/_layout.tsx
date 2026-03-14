import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import TrackPlayer from 'react-native-track-player';

import { setupPlayer } from '../services/playerSetup';
import PlaybackService from '../services/playbackService';
TrackPlayer.registerPlaybackService(() => require('../services/playbackService').default);

export default function RootLayout() {
  useEffect(() => {
    async function ligarMotor() {
      await setupPlayer();
    }
    ligarMotor();
  }, []);

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}