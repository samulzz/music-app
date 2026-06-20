import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const API_KEY = 'REDACTED_API_KEY';
const NGROK_BYPASS = 'true';

type Playlist = {
  id: number;
  name: string;
  description?: string;
  iconUrl?: string;
};

type HomePlaylist = {
  id: string;
  title: string;
  description: string;
  iconUrl?: string;
  kind: 'most-downloaded' | 'global';
};

export default function HomePlaylistsScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [playlists, setPlaylists] = useState<HomePlaylist[]>([]);

  const router = useRouter();

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => {
      if (u) setUsername(u);
    });
  }, []);

  const getAuthHeaders = useCallback(async () => {
    const rawToken = (await AsyncStorage.getItem('userToken'))?.trim() ?? '';
    if (!rawToken) throw new Error('Sessao expirada. Faca login novamente.');

    const normalizedToken = rawToken.startsWith('Bearer ')
      ? rawToken.slice(7).trim()
      : rawToken;

    return {
      'X-API-KEY': API_KEY,
      'Authorization': `Bearer ${normalizedToken}`,
      'ngrok-skip-browser-warning': NGROK_BYPASS,
      'Accept': 'application/json',
    };
  }, []);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();

      const globalRes = await fetch(`${BASE_URL}/playlists/global`, { headers });
      if (!globalRes.ok) {
        const msg = (await globalRes.text()).trim();
        throw new Error(msg || `Erro ao carregar playlists (${globalRes.status}).`);
      }

      const globalData: Playlist[] = await globalRes.json();

      const homeItems: HomePlaylist[] = [
        {
          id: 'most-downloaded',
          title: 'Mais Ouvidas',
          description: 'As músicas mais baixadas por todos os usuários.',
          kind: 'most-downloaded',
        },
        ...globalData.map((playlist) => ({
          id: String(playlist.id),
          title: playlist.name,
          description: playlist.description?.trim() || 'Playlist criada pelo admin.',
          iconUrl: playlist.iconUrl,
          kind: 'global' as const,
        })),
      ];

      setPlaylists(homeItems);
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível carregar a página inicial.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  const openPlaylist = (item: HomePlaylist) => {
    router.push({
      pathname: '/playlist/[id]' as any,
      params: {
        id: item.id,
        title: item.title,
        kind: item.kind,
      },
    });
  };

  const renderItem = ({ item }: { item: HomePlaylist }) => {
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => openPlaylist(item)}
        activeOpacity={0.82}
      >
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

        <Ionicons name="chevron-forward" size={20} color="#7a7a7a" />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, {username || 'músico'} 👋</Text>
            <Text style={styles.headerTitle}>Playlists para você</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 170 }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="albums-outline" size={60} color="#3b3b3b" />
                <Text style={styles.emptyTitle}>Sem playlists disponíveis</Text>
                <Text style={styles.emptySubtitle}>Assim que o admin criar playlists, elas aparecem aqui.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: { flex: 1, paddingHorizontal: 18 },
  header: { paddingTop: 20, paddingBottom: 18 },
  greeting: { fontSize: 13, color: '#888', marginBottom: 2 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 12,
    marginBottom: 10,
  },
  cover: { width: 62, height: 62, borderRadius: 10, marginRight: 12 },
  coverPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 10,
    marginRight: 12,
    backgroundColor: '#202020',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2d2d2d',
  },
  meta: { flex: 1, marginRight: 8 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  description: { color: '#939393', fontSize: 13, lineHeight: 18 },

  emptyState: { paddingTop: 100, alignItems: 'center' },
  emptyTitle: { color: '#6e6e6e', fontSize: 17, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { color: '#4f4f4f', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
});