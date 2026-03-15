import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet, Text, View, FlatList, TouchableOpacity, Image,
  Alert, ActivityIndicator, SafeAreaView, Platform, StatusBar,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TrackPlayer, {
  Event,
  useActiveTrack,
  useIsPlaying,
  useProgress,
  useTrackPlayerEvents,
} from 'react-native-track-player';

import {
  playSongAtIndex,
  setupPlayer,
  skipToRelative,
  stopPlayer,
  type PlayerSong,
} from '../../services/playerSetup';

const BASE_URL = 'https://pseudoprincely-plumular-nikolas.ngrok-free.dev/api';
const API_KEY = 'NationMusics_SecretAppKey_2026';
const NGROK_BYPASS = 'true';

type Song = PlayerSong;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const totalSeconds = Math.floor(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function LibraryScreen() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [shuffle, setShuffle] = useState(false);
  const [activeQueueIndex, setActiveQueueIndex] = useState<number | null>(null);
  const [optimisticSongId, setOptimisticSongId] = useState<string | null>(null);
  const [playWhenReady, setPlayWhenReady] = useState<boolean | null>(null);

  const songsRef = useRef(songs);
  const shuffleRef = useRef(shuffle);

  const router = useRouter();
  const playbackStatus = useIsPlaying();
  const activeTrack = useActiveTrack();
  const progress = useProgress(800);

  const localQueue = songs.filter((song) => song.isLocal && song.uriLocal);
  const trackSongId = activeTrack?.id != null ? String(activeTrack.id) : null;
  const indexedSongId = activeQueueIndex != null && activeQueueIndex >= 0
    ? localQueue[activeQueueIndex]?.id ?? null
    : null;
  const activeSongId = trackSongId ?? indexedSongId ?? optimisticSongId;
  const currentIndex = activeSongId ? songs.findIndex((song) => song.id === activeSongId) : -1;
  const currentSong = currentIndex >= 0
    ? songs[currentIndex]
    : activeTrack
      ? {
          id: activeSongId ?? 'active-track',
          nome: activeTrack.title ?? 'Reproduzindo',
          artista: activeTrack.artist ?? '',
          capa: typeof activeTrack.artwork === 'string' ? activeTrack.artwork : '',
          isLocal: true,
          uriLocal: typeof activeTrack.url === 'string' ? activeTrack.url : '',
          sourceId: typeof activeTrack.sourceId === 'string' ? activeTrack.sourceId : undefined,
        }
      : null;
  const isPlaying = playbackStatus.playing ?? false;
  const progressRatio = progress.duration > 0
    ? Math.min(progress.position / progress.duration, 1)
    : 0;
  const shouldShowPause = playWhenReady ?? isPlaying;

  const syncActiveFromPlayer = useCallback(async () => {
    try {
      const [index, track] = await Promise.all([
        TrackPlayer.getActiveTrackIndex(),
        TrackPlayer.getActiveTrack(),
      ]);

      setActiveQueueIndex(index ?? null);

      if (track?.id != null) {
        setOptimisticSongId(String(track.id));
        return;
      }

      if (index == null) {
        setOptimisticSongId(null);
      }
    } catch {}
  }, []);

  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => {
    TrackPlayer.getPlayWhenReady()
      .then((value) => setPlayWhenReady(value))
      .catch(() => {});
  }, []);

  useEffect(() => {
    syncActiveFromPlayer().catch(() => {});
  }, [syncActiveFromPlayer]);

  useTrackPlayerEvents([
    Event.PlaybackActiveTrackChanged,
    Event.PlaybackPlayWhenReadyChanged,
    Event.PlaybackState,
  ], (event) => {
    if (event.type === Event.PlaybackPlayWhenReadyChanged) {
      setPlayWhenReady(event.playWhenReady);
    }

    const nextIndex = typeof event.index === 'number' ? event.index : null;
    if (nextIndex != null) {
      setActiveQueueIndex(nextIndex);
    }

    if (event.track?.id != null) {
      setOptimisticSongId(String(event.track.id));
    }

    syncActiveFromPlayer().catch(() => {});
  });

  useEffect(() => {
    if (trackSongId || indexedSongId || !isPlaying) {
      setOptimisticSongId(null);
    }
  }, [trackSongId, indexedSongId, isPlaying]);

  useEffect(() => {
    AsyncStorage.getItem('username').then((u) => { if (u) setUsername(u); });
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

  const syncLibrary = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${BASE_URL}/songs/my-library`, {
        headers,
      });

      if (!res.ok) {
        const msg = (await res.text()).trim();
        const shortMsg = msg.slice(0, 180) || 'Sem detalhes do servidor.';
        throw new Error(`HTTP ${res.status}: ${shortMsg}`);
      }

      const cloudSongs = await res.json();
      const dir = FileSystem.documentDirectory;
      if (!dir) return;

      const localFiles = await FileSystem.readDirectoryAsync(dir);

      const synced: Song[] = cloudSongs.map((s: any) => {
        const clean = s.title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        const filename = `${clean}.mp3`;
        const isLocal = localFiles.includes(filename);
        return {
          id: s.id.toString(),
          nome: s.title,
          artista: s.artist,
          capa: s.coverUrl,
          isLocal,
          uriLocal: dir + filename,
          sourceId: s.sourceId || undefined,
        };
      });

      setSongs(synced);
    } catch (e: any) {
      Alert.alert('Erro de sincronização', e.message || 'Não foi possível carregar a biblioteca.');
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useFocusEffect(
    useCallback(() => {
      void syncLibrary();
    }, [syncLibrary])
  );

  const removeFromLibrary = async (song: Song) => {
    Alert.alert(
      'Remover música',
      `Remover "${song.nome}" da sua biblioteca?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              const headers = await getAuthHeaders();
              const res = await fetch(`${BASE_URL}/songs/remove/${song.id}`, {
                method: 'DELETE',
                headers,
              });
              if (!res.ok) {
                const msg = await res.text();
                const shortMsg = (msg || '').trim().slice(0, 180);
                throw new Error(shortMsg || `Falha ao remover (${res.status}).`);
              }
              setSongs((prev) => prev.filter((s) => s.id !== song.id));
            } catch (e: any) {
              Alert.alert('Erro', e.message);
            }
          },
        },
      ]
    );
  };

  const resolveSourceId = async (song: Song): Promise<string> => {
    if (song.sourceId) return song.sourceId;

    const headers = await getAuthHeaders();
    const q = `${song.nome} ${song.artista}`.trim();
    const res = await fetch(`${BASE_URL}/musicas/buscar?q=${encodeURIComponent(q)}`, { headers });
    if (!res.ok) {
      const msg = (await res.text()).trim();
      throw new Error(msg || `Não foi possível descobrir o ID da música (${res.status}).`);
    }

    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0 || !list[0]?.id) {
      throw new Error('Não foi possível identificar esta música para download automático.');
    }

    return list[0].id as string;
  };

  const downloadCloudSong = async (song: Song, index: number) => {
    if (downloadingId === song.id) return;

    setDownloadingId(song.id);
    try {
      const dir = FileSystem.documentDirectory;
      if (!dir) throw new Error('Diretório local indisponível no dispositivo.');

      const headers = await getAuthHeaders();
      const sourceId = await resolveSourceId(song);
      const clean = song.nome.replace(/[^a-zA-Z0-9 ]/g, '').trim();
      const destination = dir + `${clean}.mp3`;

      const downloadUrl = `${BASE_URL}/musicas/baixar/${sourceId}?titulo=${encodeURIComponent(clean)}`;
      const { uri } = await FileSystem.downloadAsync(downloadUrl, destination, { headers });

      const saveRes = await fetch(`${BASE_URL}/songs/save`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: song.nome,
          artist: song.artista,
          uri,
          coverUrl: song.capa,
          sourceId,
        }),
      });

      if (!saveRes.ok) {
        const msg = (await saveRes.text()).trim();
        throw new Error(msg || `Falha ao salvar na nuvem (${saveRes.status}).`);
      }

      const updatedSong: Song = {
        ...song,
        isLocal: true,
        uriLocal: uri,
        sourceId,
      };

      let nextSongs: Song[] = [];
      setSongs((prev) => {
        nextSongs = prev.map((s, i) => (i === index ? updatedSong : s));
        songsRef.current = nextSongs;
        return nextSongs;
      });

      await playAtIndex(index, nextSongs);
    } catch (e: any) {
      Alert.alert('Erro no download', e.message || 'Não foi possível baixar esta música.');
    } finally {
      setDownloadingId((current) => (current === song.id ? null : current));
    }
  };

  const playAtIndex = async (index: number, sourceSongs?: Song[]) => {
    const list = sourceSongs ?? songsRef.current;
    if (index < 0 || index >= list.length) return;
    const song = list[index];

    const queueIndex = list
      .filter((candidate) => candidate.isLocal && candidate.uriLocal)
      .findIndex((candidate) => candidate.id === song.id);

    if (queueIndex >= 0) {
      setActiveQueueIndex(queueIndex);
      setOptimisticSongId(song.id);
    }

    if (!song.isLocal) {
      await downloadCloudSong(song, index);
      return;
    }

    try {
      const resolvedQueueIndex = await playSongAtIndex(list, index);
      if (resolvedQueueIndex != null) {
        setActiveQueueIndex(resolvedQueueIndex);
      }
      setPlayWhenReady(true);
    } catch (e: any) {
      setOptimisticSongId(null);
      Alert.alert('Erro no player', e.message || 'Nao foi possivel reproduzir esta musica.');
    }
  };

  const nextSong = async () => {
    const list = songsRef.current;
    if (!list.length) return;
    if (shuffleRef.current) {
      const localIndices = list
        .map((song, index) => ({ song, index }))
        .filter(({ song }) => song.isLocal)
        .map(({ index }) => index);

      if (!localIndices.length) return;

      const currentSongId = activeSongId;
      const candidates = localIndices.filter((index) => list[index]?.id !== currentSongId);
      const pool = candidates.length ? candidates : localIndices;
      const nextIndex = pool[Math.floor(Math.random() * pool.length)];
      await playAtIndex(nextIndex);
      return;
    }

    await skipToRelative(1);
    await syncActiveFromPlayer();
  };

  const prevSong = async () => {
    await skipToRelative(-1);
    await syncActiveFromPlayer();
  };

  const togglePlayPause = async () => {
    try {
      const playWhenReady = await TrackPlayer.getPlayWhenReady();

      if (playWhenReady) {
        setPlayWhenReady(false);
        await TrackPlayer.setPlayWhenReady(false);
        await TrackPlayer.pause();
      } else {
        setPlayWhenReady(true);
        await setupPlayer();
        await TrackPlayer.setPlayWhenReady(true);
        await TrackPlayer.play();
      }
    } catch (e: any) {
      Alert.alert('Erro no player', e.message || 'Nao foi possivel alterar a reproducao.');
    }
  };

  const logout = async () => {
    Alert.alert('Sair', 'Deseja encerrar a sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          await stopPlayer();
          await AsyncStorage.multiRemove(['userToken', 'username']);
          router.replace('/login' as any);
        },
      },
    ]);
  };

  const renderItem = ({ item, index }: { item: Song; index: number }) => {
    const isCurrent = item.id === activeSongId;
    const isDownloading = downloadingId === item.id;
    return (
      <TouchableOpacity
        style={[styles.card, isCurrent && styles.cardActive]}
        onPress={() => playAtIndex(index)}
        onLongPress={() => removeFromLibrary(item)}
        activeOpacity={0.75}
        delayLongPress={500}
      >
        {item.capa
          ? <Image source={{ uri: item.capa }} style={[styles.cover, !item.isLocal && styles.coverDim]} />
          : (
            <View style={[styles.coverPlaceholder, isCurrent && styles.coverPlaceholderActive]}>
              <Ionicons name="musical-notes" size={22} color={isCurrent ? '#1db954' : '#555'} />
            </View>
          )
        }
        <View style={styles.cardMeta}>
          <Text
            style={[styles.songName, isCurrent && styles.songNameActive, !item.isLocal && styles.songNameDim]}
            numberOfLines={1}
          >
            {item.nome}
          </Text>
          <Text style={styles.artistName} numberOfLines={1}>{item.artista}</Text>
        </View>
        {isCurrent
          ? <Ionicons name="volume-medium" size={18} color="#1db954" />
          : isDownloading
            ? <ActivityIndicator size="small" color="#1db954" />
            : !item.isLocal
              ? <Ionicons name="cloud-download-outline" size={18} color="#555" />
              : <Ionicons name="play-circle-outline" size={18} color="#333" />
        }
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSub}>{username}</Text>
            <Text style={styles.headerTitle}>Sua Biblioteca</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn} onPress={syncLibrary} disabled={loading}>
              {loading
                ? <ActivityIndicator size="small" color="#1db954" />
                : <Ionicons name="refresh-outline" size={20} color="#888" />
              }
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={logout}>
              <Ionicons name="log-out-outline" size={20} color="#888" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Song count */}
        {songs.length > 0 && (
          <Text style={styles.count}>
            {songs.length} {songs.length === 1 ? 'música' : 'músicas'} • Toque para ouvir/baixar • Pressione e segure para remover
          </Text>
        )}

        {/* List */}
        {loading && songs.length === 0 ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#1db954" />
            <Text style={styles.loadingText}>Sincronizando biblioteca...</Text>
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: currentSong ? 130 : 20 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centerContent}>
                <Ionicons name="library-outline" size={64} color="#2a2a2a" />
                <Text style={styles.emptyTitle}>Biblioteca vazia</Text>
                <Text style={styles.emptySubtitle}>
                  Busque músicas na aba de pesquisa e baixe-as para aparecerem aqui.
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* Mini Player */}
      {currentSong && (
        <View style={styles.player}>
          <View style={styles.playerInfo}>
            {currentSong.capa
              ? <Image source={{ uri: currentSong.capa }} style={styles.playerCover} />
              : (
                <View style={[styles.playerCover, styles.playerCoverPlaceholder]}>
                  <Ionicons name="musical-notes" size={18} color="#1db954" />
                </View>
              )
            }
            <View style={styles.playerMeta}>
              <Text style={styles.playerTitle} numberOfLines={1}>{currentSong.nome}</Text>
              <Text style={styles.playerArtist} numberOfLines={1}>{currentSong.artista}</Text>
            </View>
          </View>

          <View style={styles.playerControls}>
            <TouchableOpacity onPress={() => setShuffle(!shuffle)} style={styles.ctrlBtn}>
              <Ionicons name="shuffle" size={20} color={shuffle ? '#1db954' : '#555'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { prevSong().catch(() => {}); }} style={styles.ctrlBtn}>
              <Ionicons name="play-skip-back" size={22} color="#ccc" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
              <Ionicons name={shouldShowPause ? 'pause' : 'play'} size={22} color="#121212" style={!shouldShowPause ? { marginLeft: 2 } : {}} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { nextSong().catch(() => {}); }} style={styles.ctrlBtn}>
              <Ionicons name="play-skip-forward" size={22} color="#ccc" />
            </TouchableOpacity>
          </View>

          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressText}>{formatTime(progress.position)}</Text>
              <Text style={styles.progressText}>{formatTime(progress.duration)}</Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  container: { flex: 1, paddingHorizontal: 18 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerSub: { fontSize: 12, color: '#666', marginBottom: 2 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerActions: { flexDirection: 'row', gap: 6 },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },

  count: { color: '#555', fontSize: 12, marginBottom: 14 },

  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  loadingText: { color: '#555', marginTop: 14, fontSize: 14 },
  emptyTitle: { color: '#444', fontSize: 18, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  emptySubtitle: { color: '#333', fontSize: 13, textAlign: 'center', paddingHorizontal: 32 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'transparent',
  },
  cardActive: { backgroundColor: '#1e1e1e' },
  cover: { width: 52, height: 52, borderRadius: 8, marginRight: 14 },
  coverDim: { opacity: 0.45 },
  coverPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  coverPlaceholderActive: { backgroundColor: '#1db95418' },
  cardMeta: { flex: 1 },
  songName: { color: '#ddd', fontSize: 15, fontWeight: '500', marginBottom: 3 },
  songNameActive: { color: '#1db954', fontWeight: '700' },
  songNameDim: { color: '#555' },
  artistName: { color: '#666', fontSize: 12 },

  player: {
    position: 'absolute',
    bottom: 70,
    left: 12,
    right: 12,
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  playerCover: { width: 44, height: 44, borderRadius: 8, marginRight: 12 },
  playerCoverPlaceholder: { backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  playerMeta: { flex: 1 },
  playerTitle: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  playerArtist: { color: '#888', fontSize: 11 },
  playerControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctrlBtn: { padding: 6 },
  playBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 8,
  },
  progressTrack: {
    height: 3,
    borderRadius: 999,
    backgroundColor: '#2d2d2d',
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#1db954',
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    color: '#666',
    fontSize: 10,
  },
});