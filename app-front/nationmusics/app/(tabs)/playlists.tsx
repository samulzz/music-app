import { memo, useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import type { ApiPlaylist } from '../../types/music';
import { apiRequest } from '../../services/api';
import { getDailyMix } from '../../services/recommendations';

const CACHE_KEY = 'nationmusics.personal-playlists.v1';
const PLAYLISTS_CACHE_TTL_MS = 5 * 60 * 1000;

type PersonalPlaylistsCache = {
  savedAt: number;
  playlists: ApiPlaylist[];
};

const PlaylistCard = memo(function PlaylistCard({
  playlist,
  onOpen,
  onLongPress,
}: {
  playlist: ApiPlaylist;
  onOpen: (playlist: ApiPlaylist) => void;
  onLongPress: (playlist: ApiPlaylist) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onOpen(playlist)}
      onLongPress={() => onLongPress(playlist)}
      activeOpacity={0.84}
    >
      {playlist.iconUrl ? (
        <Image source={{ uri: playlist.iconUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="musical-notes" size={25} color="#1db954" />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>{playlist.name}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {playlist.description?.trim() || `${playlist.songs?.length ?? 0} músicas`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#666" />
    </TouchableOpacity>
  );
});

export default function PersonalPlaylistsScreen() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<ApiPlaylist | null>(null);
  const [dailyMixName, setDailyMixName] = useState('Seu mix diário');
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const readCache = useCallback(async (): Promise<PersonalPlaylistsCache> => {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return { savedAt: 0, playlists: [] };
    try {
      const parsed = JSON.parse(raw) as PersonalPlaylistsCache;
      return {
        savedAt: Number(parsed.savedAt) || 0,
        playlists: Array.isArray(parsed.playlists) ? parsed.playlists : [],
      };
    } catch {
      return { savedAt: 0, playlists: [] };
    }
  }, []);

  const writeCache = useCallback(async (next: ApiPlaylist[]) => {
    const savedAt = Date.now();
    lastRefreshAtRef.current = savedAt;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, playlists: next }));
  }, []);

  const loadPlaylists = useCallback(async (showSpinner = true, force = false) => {
    const cacheIsFresh = lastRefreshAtRef.current > 0
      && Date.now() - lastRefreshAtRef.current < PLAYLISTS_CACHE_TTL_MS;

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
      const data = await apiRequest<ApiPlaylist[]>('/playlists/personal');
      const next = Array.isArray(data) ? data : [];
      setPlaylists(next);
      await writeCache(next);
    } catch (error) {
      const cached = await readCache();
      if (cached.playlists.length) {
        setPlaylists(cached.playlists);
        lastRefreshAtRef.current = cached.savedAt;
      } else {
      Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível carregar suas playlists.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      refreshInFlightRef.current = null;
    }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [readCache, writeCache]);

  const hydratePlaylists = useCallback(async () => {
    const cached = await readCache();
    if (cached.playlists.length) {
      setPlaylists(cached.playlists);
      lastRefreshAtRef.current = cached.savedAt;
      setLoading(false);
      void loadPlaylists(false);
      return;
    }

    void loadPlaylists(true, true);
  }, [loadPlaylists, readCache]);

  useFocusEffect(
    useCallback(() => {
      void getDailyMix().then((mix) => setDailyMixName(mix.name)).catch(() => {});
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        void hydratePlaylists();
        return;
      }

      void loadPlaylists(false);
    }, [hydratePlaylists, loadPlaylists])
  );

  const resetForm = () => {
    setName('');
    setDescription('');
    setIconUrl('');
    setEditingPlaylist(null);
  };

  const createPlaylist = async () => {
    const cleanName = name.trim();
    if (!cleanName) {
      Alert.alert('Nome obrigatório', 'Dê um nome para a playlist.');
      return;
    }

    setSaving(true);
    try {
      await apiRequest<ApiPlaylist>(editingPlaylist ? `/playlists/personal/${editingPlaylist.id}` : '/playlists/personal', {
        method: editingPlaylist ? 'PUT' : 'POST',
        json: true,
        body: JSON.stringify({
          name: cleanName,
          description: description.trim() || null,
          iconUrl: iconUrl.trim() || null,
          globalPlaylist: false,
        }),
      });
      setModalVisible(false);
      resetForm();
      await loadPlaylists(false, true);
    } catch (error) {
      Alert.alert('Não foi possível criar', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const editPlaylist = (playlist: ApiPlaylist) => {
    setEditingPlaylist(playlist);
    setName(playlist.name || '');
    setDescription(playlist.description || '');
    setIconUrl(playlist.iconUrl || '');
    setModalVisible(true);
  };

  const managePlaylist = (playlist: ApiPlaylist) => {
    Alert.alert(playlist.name, 'O que deseja alterar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Editar detalhes', onPress: () => editPlaylist(playlist) },
      { text: 'Excluir playlist', style: 'destructive', onPress: () => deletePlaylist(playlist) },
    ]);
  };

  const deletePlaylist = (playlist: ApiPlaylist) => {
    Alert.alert('Excluir playlist', `Excluir "${playlist.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest<void>(`/playlists/personal/${playlist.id}`, { method: 'DELETE' });
            setPlaylists((current) => {
              const next = current.filter((item) => item.id !== playlist.id);
              void writeCache(next);
              return next;
            });
          } catch (error) {
            Alert.alert('Não foi possível excluir', error instanceof Error ? error.message : 'Tente novamente.');
          }
        },
      },
    ]);
  };

  const openPlaylist = (playlist: ApiPlaylist) => {
    router.push({
      pathname: '/playlist/[id]' as never,
      params: { id: String(playlist.id), title: playlist.name, kind: 'personal' },
    });
  };

  const openLibrary = () => {
    router.push({
      pathname: '/playlist/[id]' as never,
      params: { id: 'library', title: 'Minhas Músicas', kind: 'library' },
    });
  };

  const openDailyMix = () => {
    router.push({
      pathname: '/playlist/[id]' as never,
      params: { id: 'daily', title: dailyMixName, kind: 'daily' },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Músicas e coleções</Text>
            <Text style={styles.headerTitle}>Sua Biblioteca</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <PlaylistCard playlist={item} onOpen={openPlaylist} onLongPress={managePlaylist} />
            )}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                <TouchableOpacity style={styles.libraryCard} onPress={openLibrary} activeOpacity={0.86}>
                  <View style={styles.libraryCover}>
                    <Ionicons name="heart" size={30} color="#fff" />
                  </View>
                  <View style={styles.libraryMeta}>
                    <Text style={styles.libraryEyebrow}>NA SUA CONTA</Text>
                    <Text style={styles.libraryTitle}>Minhas Músicas</Text>
                    <Text style={styles.libraryDescription}>Todas as músicas que você salvou.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#aaa" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.dailyCard} onPress={openDailyMix} activeOpacity={0.86}>
                  <View style={styles.dailyCover}>
                    <Ionicons name="sparkles" size={28} color="#fff" />
                  </View>
                  <View style={styles.libraryMeta}>
                    <Text style={styles.dailyEyebrow}>RENOVADA TODOS OS DIAS</Text>
                    <Text style={styles.libraryTitle}>{dailyMixName}</Text>
                    <Text style={styles.libraryDescription}>100 músicas que combinam com o que você ouve.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#aaa" />
                </TouchableOpacity>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Suas playlists</Text>
                  <View style={styles.sectionActions}>
                    <Text style={styles.sectionHint}>Segure para editar</Text>
                    <TouchableOpacity
                      accessibilityLabel="Criar playlist"
                      style={styles.smallAddButton}
                      onPress={() => { resetForm(); setModalVisible(true); }}
                    >
                      <Ionicons name="add" size={18} color="#121212" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#1db954"
                colors={['#1db954']}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadPlaylists(false, true);
                }}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="list-outline" size={50} color="#555" />
                <Text style={styles.emptyTitle}>Nenhuma playlist pessoal</Text>
                <Text style={styles.emptyText}>Crie sua primeira playlist pelo botão ao lado de “Suas playlists”.</Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editingPlaylist ? 'Editar playlist' : 'Nova playlist'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Nome"
              placeholderTextColor="#777"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Descrição opcional"
              placeholderTextColor="#777"
              value={description}
              onChangeText={setDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="URL da capa opcional"
              placeholderTextColor="#777"
              value={iconUrl}
              onChangeText={setIconUrl}
              autoCapitalize="none"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
              >
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={() => { void createPlaylist(); }} disabled={saving}>
                {saving ? <ActivityIndicator color="#121212" /> : <Text style={styles.primaryButtonText}>{editingPlaylist ? 'Salvar' : 'Criar'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 170 },
  libraryCard: {
    minHeight: 104,
    borderRadius: 16,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#383838',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 10,
  },
  dailyCard: {
    minHeight: 94,
    borderRadius: 16,
    backgroundColor: '#1d3028',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 22,
  },
  dailyCover: {
    width: 68,
    height: 68,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyEyebrow: { color: '#8fe4ad', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  libraryCover: {
    width: 76,
    height: 76,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: '#5038a0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryMeta: { flex: 1, paddingRight: 8 },
  libraryEyebrow: { color: '#b9aef3', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  libraryTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 3 },
  libraryDescription: { color: '#aaa', fontSize: 11, marginTop: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  sectionHint: { color: '#666', fontSize: 10 },
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  smallAddButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minHeight: 72,
    borderRadius: 12,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#292929',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 9,
    marginBottom: 8,
  },
  cover: { width: 52, height: 52, borderRadius: 8, marginRight: 11 },
  coverPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: 11,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, paddingRight: 9 },
  title: { color: '#fff', fontSize: 14, fontWeight: '700' },
  description: { color: '#858585', fontSize: 11, lineHeight: 15, marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 24 },
  emptyTitle: { color: '#ddd', fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 18,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#303030',
    padding: 18,
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: {
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: '#121212',
    borderWidth: 1,
    borderColor: '#303030',
    color: '#fff',
    paddingHorizontal: 13,
    marginBottom: 10,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 6 },
  secondaryButton: {
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2a2a2a',
  },
  secondaryButtonText: { color: '#ddd', fontWeight: '700' },
  primaryButton: {
    height: 42,
    minWidth: 82,
    borderRadius: 21,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1db954',
  },
  primaryButtonText: { color: '#121212', fontWeight: '800' },
});
