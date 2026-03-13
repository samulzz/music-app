import { Stack } from 'expo-router';
import { useEffect } from 'react';
import TrackPlayer from 'react-native-track-player';

import { setupPlayer } from '../services/playerSetup';
import { PlaybackService } from '../services/playbackService';

TrackPlayer.registerPlaybackService(() => PlaybackService);

export default function RootLayout() {
  
  useEffect(() => {
    async function ligarMotor() {
      const pronto = await setupPlayer();
      if (pronto) {
        console.log("Motor de áudio nativo ligado com sucesso!");
      }
    }
    ligarMotor();
  }, []);

  return (
    <Stack>
      {}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}