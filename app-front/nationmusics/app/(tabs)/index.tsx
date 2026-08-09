import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { getDailyMix } from '../../services/recommendations';

type HomePlaylist = {
  id: string;
  title: string;
  description: string;
  iconUrl?: string;
  kind: 'daily' | 'most-downloaded' | 'global';
};

const CACHE_KEY = 'nationmusics.home-playlists.v2';
const LEGACY_CACHE_KEY = 'nationmusics.home-playlists.v1';
const HOME_CACHE_TTL_MS = 5 * 60 * 1000;

type HomePlaylistsCache = {
  savedAt: number;
  playlists: HomePlaylist[];
};

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
            name={item.kind === 'daily' ? 'sparkles' : item.kind === 'most-downloaded' ? 'flame' : 'musical-notes'}
            size={28}
            color="#1db954"
          />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
      </View>
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
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  const readCache = useCallback(async (): Promise<HomePlaylistsCache> => {
    const raw = await AsyncStorage.getItem(CACHE_KEY) || await AsyncStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return { savedAt: 0, playlists: [] };
    try {
      const parsed = JSON.parse(raw) as HomePlaylistsCache | HomePlaylist[];
      if (Array.isArray(parsed)) return { savedAt: 0, playlists: parsed };
      if (Array.isArray(parsed.playlists)) {
        return { savedAt: Number(parsed.savedAt) || 0, playlists: parsed.playlists };
      }
      return { savedAt: 0, playlists: [] };
    } catch {
      return { savedAt: 0, playlists: [] };
    }
  }, []);

  const writeCache = useCallback(async (next: HomePlaylist[]) => {
    const savedAt = Date.now();
    lastRefreshAtRef.current = savedAt;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, playlists: next }));
  }, []);

  const loadHome = useCallback(async (showSpinner = true, force = false) => {
    const cacheIsFresh = lastRefreshAtRef.current > 0
      && Date.now() - lastRefreshAtRef.current < HOME_CACHE_TTL_MS;

    if (!force && cacheIsFresh) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (refreshInFlightRef.current) {
      if (showSpinner && !lastRefreshAtRef.current) setLoading(true);
      return refreshInFlightRef.current;
    }

    if (showSpinner && !lastRefreshAtRef.current) setLoading(true);

    const operation = (async () => {
      try {
      const [globalData, dailyMix] = await Promise.all([
        apiRequest<ApiPlaylist[]>('/playlists/global', { authenticated: false }),
        getDailyMix().catch(() => null),
      ]);
      const next: HomePlaylist[] = [
        ...(dailyMix ? [{
          id: 'daily',
          title: dailyMix.name,
          description: dailyMix.description,
          kind: 'daily' as const,
        }] : []),
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
      await writeCache(next);
    } catch (error) {
      const cached = await readCache();
      if (cached.playlists.length) {
        setPlaylists(cached.playlists);
        lastRefreshAtRef.current = cached.savedAt;
      }
      setOffline(error instanceof OfflineError || netInfo.isConnected === false);
      if (!cached.playlists.length && !(error instanceof OfflineError)) {
        Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível carregar as playlists.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshInFlightRef.current = null;
    }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [netInfo.isConnected, readCache, writeCache]);

  const hydrateHome = useCallback(async () => {
    const cached = await readCache();
    if (cached.playlists.length) {
      setPlaylists(cached.playlists);
      lastRefreshAtRef.current = cached.savedAt;
      setLoading(false);
      void loadHome(false);
      return;
    }

    void loadHome(true, true);
  }, [loadHome, readCache]);

  useFocusEffect(
    useCallback(() => {
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        void hydrateHome();
        return;
      }

      void loadHome(false);
    }, [hydrateHome, loadHome])
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
            <Text style={styles.headerTitle}>Feito para você</Text>
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
            data={playlists.slice(1)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <PlaylistCard item={item} onPress={openPlaylist} />}
            numColumns={2}
            columnWrapperStyle={styles.columns}
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
                  void loadHome(false, true);
                }}
              />
            }
            ListEmptyComponent={playlists.length ? null : (
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={42} color="#555" />
                <Text style={styles.emptyTitle}>Nenhuma playlist em cache</Text>
                <Text style={styles.emptyText}>Abra a biblioteca para ouvir suas músicas offline.</Text>
              </View>
            )}
            ListHeaderComponent={playlists[0] ? (
              <View>
                <TouchableOpacity style={styles.featuredCard} onPress={() => openPlaylist(playlists[0])} activeOpacity={0.84}>
                  {playlists[0].iconUrl ? (
                    <Image source={{ uri: playlists[0].iconUrl }} style={styles.featuredCover} />
                  ) : (
                    <View style={styles.featuredPlaceholder}>
                      <Ionicons name={playlists[0].kind === 'daily' ? 'sparkles' : 'flame'} size={38} color="#fff" />
                    </View>
                  )}
                  <View style={styles.featuredMeta}>
                    <Text style={styles.featuredEyebrow}>{playlists[0].kind === 'daily' ? 'ATUALIZADA TODO DIA' : 'EM DESTAQUE'}</Text>
                    <Text style={styles.featuredTitle} numberOfLines={1}>{playlists[0].title}</Text>
                    <Text style={styles.featuredDescription} numberOfLines={2}>{playlists[0].description}</Text>
                  </View>
                  <View style={styles.featuredPlay}><Ionicons name="play" size={20} color="#111" /></View>
                </TouchableOpacity>
                <Text style={styles.sectionTitle}>Feito para ouvir agora</Text>
              </View>
            ) : null}
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
  columns: { gap: 10 },
  featuredCard: {
    minHeight: 116,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#253d2c',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    marginBottom: 22,
  },
  featuredCover: { width: 88, height: 88, borderRadius: 12, marginRight: 14 },
  featuredPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 12,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1db954',
  },
  featuredMeta: { flex: 1, paddingRight: 8 },
  featuredEyebrow: { color: '#8fe4ad', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  featuredTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 4 },
  featuredDescription: { color: '#c4d1c8', fontSize: 11, lineHeight: 16, marginTop: 5 },
  featuredPlay: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1db954', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  card: {
    flex: 1,
    maxWidth: '48.5%',
    minWidth: 0,
    borderRadius: 12,
    backgroundColor: '#1b1b1b',
    padding: 9,
    marginBottom: 10,
  },
  cover: { width: '100%', aspectRatio: 1.35, borderRadius: 9, marginBottom: 9 },
  coverPlaceholder: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: 9,
    marginBottom: 9,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { minHeight: 49 },
  title: { color: '#fff', fontSize: 13, fontWeight: '800' },
  description: { color: '#858585', fontSize: 10, lineHeight: 14, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyTitle: { color: '#ddd', fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', marginTop: 6 },
});
