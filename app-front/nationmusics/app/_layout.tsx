import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MandatoryUpdateGate } from '../components/mandatory-update-gate';
import { ConnectSync } from '../components/connect-sync';
import { PresenceHeartbeat } from '../components/presence-heartbeat';
import { EngagementNotifications } from '../components/engagement-notifications';
import { refreshAndroidAutoLibrary, setupMusicPlayer } from '../services/player';

export default function RootLayout() {
  setupMusicPlayer();
  useEffect(() => {
    refreshAndroidAutoLibrary().catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <MandatoryUpdateGate>
        <ConnectSync />
        <PresenceHeartbeat />
        <EngagementNotifications />
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: '#121212' },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="playlist/[id]" />
          <Stack.Screen name="jam/[code]" />
        </Stack>
      </MandatoryUpdateGate>
    </SafeAreaProvider>
  );
}
