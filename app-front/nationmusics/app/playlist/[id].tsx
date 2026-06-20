import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

import { playPlaylistAtIndex, type PlayerSong } from '../../services/playerSetup';
import GlobalMiniPlayer from '../../components/global-mini-player';
import { useActiveTrackFallback } from '../../hooks/use-active-track-fallback';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const API_KEY = 'REDACTED_API_KEY';
const NGROK_BYPASS = 'true';

type ApiSong = {
  id: number;
  title: string;
  artist: string;
  coverUrl?: string;
  sourceId?: string;
};

type PlaylistSong = PlayerSong & {
  dbId: number;
};

export default function PlaylistDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; title?: string; kind?: string }>();
  const router = useRouter();

  const [songs, setSongs] = useState<PlaylistSong[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeTrack = useActiveTrackFallback();

  const screenTitle = useMemo(() => {
    return typeof params.title === 'string' && params.title.trim()
      ? params.title
      : 'Playlist';
  }, [params.title]);

  const getAuthHeaders = useCallback(async (withJson = false) => {
    const rawToken = (await AsyncStorage.getItem('userToken'))?.trim() ?? '';
    if (!rawToken) throw new Error('Sessao expirada. Faça login novamente.');

    const normalizedToken = rawToken.startsWith('Bearer ')
      ? rawToken.slice(7).trim()
      : rawToken;

    return {
      'X-API-KEY': API_KEY,
      'Authorization': `Bearer ${normalizedToken}`,
      'ngrok-skip-browser-warning': NGROK_BYPASS,
      'Accept': 'application/json',
      ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    };
  }, []);

  const toPlayableSong = (song: ApiSong): PlaylistSong => ({
    dbId: song.id,
    id: String(song.id),
    nome: song.title,
    artista: song.artist,
    capa: song.coverUrl || '',
    isLocal: false,
    uriLocal: '',
    sourceId: song.sourceId,
  });

  const resolveSourceId = useCallback(async (song: PlaylistSong) => {
    if (song.sourceId?.trim()) return song.sourceId.trim();

    const headers = await getAuthHeaders();
    const query = `${song.nome} ${song.artista}`.trim();
    const res = await fetch(`${BASE_URL}/musicas/buscar?q=${encodeURIComponent(query)}`, { headers });

    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Não foi possível descobrir o ID da música (${res.status}).`);
    }

    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0 || !list[0]?.id) {
      throw new Error('Não foi possível identificar esta música para download.');
    }

    return String(list[0].id);
  }, [getAuthHeaders]);

  const buildSongPath = useCallback((song: PlaylistSong) => {
    const dir = FileSystem.documentDirectory;
    if (!dir) {
      throw new Error('Diretório local indisponível.');
    }

    const cleanTitle = song.nome.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    const fileName = `${cleanTitle || song.sourceId || song.id}.mp3`;
    return { destination: `${dir}${fileName}` };
  }, []);

  const downloadPlaylistSong = useCallback(async (song: PlaylistSong) => {
    const sourceId = await resolveSourceId(song);
    const { destination } = buildSongPath(song);
    const info = await FileSystem.getInfoAsync(destination);

    if (!info.exists) {
      const headers = await getAuthHeaders();
      const downloadUrl = `${BASE_URL}/musicas/baixar/${sourceId}?titulo=${encodeURIComponent(song.nome)}`;
      await FileSystem.downloadAsync(downloadUrl, destination, { headers });
    }

    return {
      ...song,
      isLocal: true,
      uriLocal: destination,
      sourceId,
    };
  }, [buildSongPath, getAuthHeaders, resolveSourceId]);

  const preparePlaylistQueue = useCallback(async (list: PlaylistSong[]) => {
    const prepared: PlaylistSong[] = [];

    for (const song of list) {
      if (song.isLocal && song.uriLocal) {
        prepared.push(song);
        continue;
      }

      prepared.push(await downloadPlaylistSong(song));
    }

    setSongs(prepared);
    return prepared;
  }, [downloadPlaylistSong]);

  const loadPlaylistSongs = useCallback(async () => {
    const id = typeof params.id === 'string' ? params.id : '';
    if (!id) return;

    setLoading(true);
    try {
      const headers = await getAuthHeaders();

      const endpoint = id === 'most-downloaded'
        ? `${BASE_URL}/playlists/most-downloaded/songs`
        : `${BASE_URL}/playlists/${id}/songs`;

      const res = await fetch(endpoint, { headers });
      if (!res.ok) {
        const msg = (await res.text()).trim();
        throw new Error(msg || `Erro ao carregar playlist (${res.status}).`);
      }

      const data: ApiSong[] = await res.json();
      setSongs(data.map(toPlayableSong));
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível carregar as músicas da playlist.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, params.id]);

  useFocusEffect(
    useCallback(() => {
      void loadPlaylistSongs();
    }, [loadPlaylistSongs])
  );

  const playAtIndex = async (index: number) => {
    if (index < 0 || index >= songs.length) return;

    const targetSong = songs[index];
    setBusyId(targetSong.id);
    try {
      const preparedSongs = await preparePlaylistQueue(songs);
      await playPlaylistAtIndex(preparedSongs, index);
    } catch (e: any) {
      Alert.alert('Erro ao reproduzir', e.message || 'Não foi possível iniciar esta playlist.');
    } finally {
      setBusyId(null);
    }
  };

  const playRandom = async () => {
    if (!songs.length) return;
    const randomIndex = Math.floor(Math.random() * songs.length);
    await playAtIndex(randomIndex);
  };

  const saveToLibrary = async (song: PlaylistSong) => {
    setBusyId(`save-${song.id}`);
    try {
      const headers = await getAuthHeaders(true);

      const downloaded = await downloadPlaylistSong(song);

      const saveRes = await fetch(`${BASE_URL}/songs/save`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: downloaded.nome,
          artist: downloaded.artista,
          uri: downloaded.uriLocal,
          coverUrl: downloaded.capa,
          sourceId: downloaded.sourceId,
        }),
      });

      if (!saveRes.ok) {
        const msg = (await saveRes.text()).trim();
        throw new Error(msg || `Erro ao salvar (${saveRes.status}).`);
      }

      Alert.alert('Adicionada', 'A música foi salva na sua biblioteca pessoal.');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Não foi possível salvar esta música na biblioteca.');
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item, index }: { item: PlaylistSong; index: number }) => {
    const playingBusy = busyId === item.id;
    const savingBusy = busyId === `save-${item.id}`;
    const isCurrent = activeTrack?.id != null && String(activeTrack.id) === item.id;

    return (
      <TouchableOpacity
        style={[styles.songCard, isCurrent && styles.songCardActive]}
        onPress={() => playAtIndex(index)}
        activeOpacity={0.82}
      >
        {item.capa
          ? <Image source={{ uri: item.capa }} style={styles.cover} />
          : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="musical-note" size={20} color="#6f6f6f" />
            </View>
          )}

        <View style={styles.meta}>
          <Text style={[styles.songTitle, isCurrent && styles.songTitleActive]} numberOfLines={1}>{item.nome}</Text>
          <Text style={styles.songArtist} numberOfLines={1}>{item.artista}</Text>
        </View>

        {isCurrent && (
          <Ionicons name="volume-medium" size={18} color="#1db954" style={{ marginRight: 8 }} />
        )}

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => saveToLibrary(item)}
          disabled={savingBusy || !!busyId}
          activeOpacity={0.82}
        >
          {savingBusy
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.subtitle}>Reproduza sem baixar para a biblioteca</Text>
            <Text style={styles.title} numberOfLines={1}>{screenTitle}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.playAllBtn}
          onPress={() => playAtIndex(0)}
          disabled={!songs.length || !!busyId}
          activeOpacity={0.84}
        >
          <Ionicons name="play-circle" size={18} color="#121212" />
          <Text style={styles.playAllText}>Ouvir playlist</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.shuffleBtn}
          onPress={() => { playRandom().catch(() => {}); }}
          disabled={!songs.length || !!busyId}
          activeOpacity={0.84}
        >
          <Ionicons name="shuffle" size={18} color="#fff" />
          <Text style={styles.shuffleText}>Aleatório</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 180 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="musical-notes-outline" size={58} color="#3c3c3c" />
                <Text style={styles.emptyTitle}>Playlist vazia</Text>
                <Text style={styles.emptyText}>Esta playlist ainda não possui músicas.</Text>
              </View>
            }
          />
        )}
      </View>

      <GlobalMiniPlayer bottomOffset={12} />
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingBottom: 18,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1f1f1f',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { color: '#7f7f7f', fontSize: 12, marginBottom: 2 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },

  playAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1db954',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  playAllText: { color: '#121212', fontSize: 14, fontWeight: '700' },
  shuffleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#242424',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#323232',
    paddingVertical: 11,
    marginBottom: 16,
  },
  shuffleText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  songCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#191919',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#252525',
    padding: 10,
    marginBottom: 10,
  },
  songCardActive: {
    borderColor: '#1db95488',
    backgroundColor: '#1a231c',
  },
  cover: { width: 52, height: 52, borderRadius: 8, marginRight: 10 },
  coverPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2b2b2b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, marginRight: 8 },
  songTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 3 },
  songTitleActive: { color: '#b9f3cd' },
  songArtist: { color: '#8c8c8c', fontSize: 12 },

  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2c2c2c',
    borderWidth: 1,
    borderColor: '#3a3a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: { paddingTop: 90, alignItems: 'center' },
  emptyTitle: { color: '#6f6f6f', fontSize: 17, fontWeight: '600', marginTop: 16 },
  emptyText: { color: '#4f4f4f', fontSize: 13, marginTop: 8 },
});