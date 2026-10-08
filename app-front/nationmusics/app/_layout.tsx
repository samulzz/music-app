import { useEffect } from 'react';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MandatoryUpdateGate } from '../components/mandatory-update-gate';
import { ConnectSync } from '../components/connect-sync';
import { PresenceHeartbeat } from '../components/presence-heartbeat';
import { EngagementNotifications } from '../components/engagement-notifications';
import { PlaylistPicker } from '../components/playlist-picker';
import { refreshAndroidAutoLibrary, setupMusicPlayer } from '../services/player';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return <View style={{flex:1, backgroundColor:'#121212', justifyContent:'center', padding:28}}>
    <Text style={{color:'#fff', fontSize:22, marginBottom:12}}>Não foi possível abrir esta tela</Text>
    <Text style={{color:'#aaa', marginBottom:20}}>Se estiver sem internet, suas músicas baixadas continuam disponíveis. Tente abrir novamente.</Text>
    <TouchableOpacity onPress={retry} style={{backgroundColor:'#1db954', padding:16, borderRadius:12}}><Text style={{textAlign:'center'}}>Tentar novamente</Text></TouchableOpacity>
  </View>;
}

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
        <PlaylistPicker />
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
          <Stack.Screen name="artist/[name]" />
          <Stack.Screen name="album/[name]" />
          <Stack.Screen name="jam/[code]" />
        </Stack>
      </MandatoryUpdateGate>
    </SafeAreaProvider>
  );
}
