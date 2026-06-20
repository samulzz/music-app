import { memo, useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';

import type { ApiPlaylist } from '../../types/music';
import { apiRequest, OfflineError } from '../../services/api';
import { getSession } from '../../services/auth';

type HomePlaylist = {
  id: string;
  title: string;
  description: string;
  iconUrl?: string;
  kind: 'most-downloaded' | 'global';
};

const CACHE_KEY = 'nationmusics.home-playlists.v1';

const PlaylistCard = memo(function PlaylistCard({
  item,
  onPress,
}: {
  item: HomePlaylist;
  onPress: (item: HomePlaylist) => void;
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(item)} activeOpacity={0.82}>
      {item.iconUrl ? (
        <Image source={{ uri: item.iconUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons
            name={item.kind === 'most-downloaded' ? 'flame' : 'musical-notes'}
            size={28}
            color="#1db954"
          />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#777" />
    </TouchableOpacity>
  );
});

export default function HomePlaylistsScreen() {
  const router = useRouter();
  const netInfo = useNetInfo();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playlists, setPlaylists] = useState<HomePlaylist[]>([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  const readCache = useCallback(async () => {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as HomePlaylist[];
    } catch {
      return [];
    }
  }, []);

  const loadHome = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const globalData = await apiRequest<ApiPlaylist[]>('/playlists/global');
      const next: HomePlaylist[] = [
        {
          id: 'most-downloaded',
          title: 'Mais ouvidas',
          description: 'As músicas mais baixadas pela comunidade.',
          kind: 'most-downloaded',
        },
        ...globalData.map((playlist) => ({
          id: String(playlist.id),
          title: playlist.name,
          description: playlist.description?.trim() || 'Playlist selecionada para você.',
          iconUrl: playlist.iconUrl,
          kind: 'global' as const,
        })),
      ];
      setPlaylists(next);
      setOffline(false);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch (error) {
      const cached = await readCache();
      setPlaylists(cached);
      setOffline(error instanceof OfflineError || netInfo.isConnected === false);
      if (!cached.length && !(error instanceof OfflineError)) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível carregar as playlists.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [netInfo.isConnected, readCache]);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  const openPlaylist = useCallback((item: HomePlaylist) => {
    router.push({
      pathname: '/playlist/[id]' as never,
      params: { id: item.id, title: item.title, kind: item.kind },
    });
  }, [router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, {username || 'músico'} 👋</Text>
            <Text style={styles.headerTitle}>Escolha uma playlist</Text>
          </View>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#1db954" />
          </View>
        </View>

        {offline && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={17} color="#f2b84b" />
            <Text style={styles.offlineText}>
              Offline: exibindo o conteúdo salvo. Sua biblioteca baixada continua disponível.
            </Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PlaylistCard item={item} onPress={openPlaylist} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#1db954"
                colors={['#1db954']}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadHome(false);
                }}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={42} color="#555" />
                <Text style={styles.emptyTitle}>Nenhuma playlist em cache</Text>
                <Text style={styles.emptyText}>Abra a biblioteca para ouvir suas músicas offline.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  greeting: { color: '#888', fontSize: 13 },
  headerTitle: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 3 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1db95418',
    borderWidth: 1,
    borderColor: '#1db95440',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5a4825',
    backgroundColor: '#2b2518',
    padding: 11,
    marginBottom: 13,
  },
  offlineText: { flex: 1, color: '#d5bd83', fontSize: 12, lineHeight: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 170 },
  card: {
    minHeight: 86,
    borderRadius: 14,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#292929',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 11,
  },
  cover: { width: 58, height: 58, borderRadius: 10, marginRight: 12 },
  coverPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, paddingRight: 9 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  description: { color: '#858585', fontSize: 12, lineHeight: 17, marginTop: 5 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyTitle: { color: '#ddd', fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 6 },
});
