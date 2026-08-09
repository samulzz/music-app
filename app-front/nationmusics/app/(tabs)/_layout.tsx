import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import GlobalMiniPlayer from '../../components/global-mini-player';
import { UserMenu } from '../../components/user-menu';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#121212',
            borderTopColor: '#262626',
            borderTopWidth: 1,
            height: 62 + bottomInset,
            paddingBottom: 8 + bottomInset,
            paddingTop: 5,
          },
          tabBarActiveTintColor: '#1db954',
          tabBarInactiveTintColor: '#737373',
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Início',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Pesquisar',
            tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="playlists"
          options={{
            title: 'Biblioteca',
            tabBarIcon: ({ color, size }) => <Ionicons name="library" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Amigos',
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
      </Tabs>
      <UserMenu />
      <GlobalMiniPlayer bottomOffset={68 + bottomInset} />
    </View>
  );
}
