import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useActiveMediaItem } from '@rntp/player';

import type { ApiLibrarySong, MusicSong } from '../../types/music';
import { fromApiLibrarySong } from '../../types/music';
import { apiRequest } from '../../services/api';
import { clearSession, getSession } from '../../services/auth';
import {
  downloadSong,
  formatBytes,
  getOfflineLibrary,
  mergeWithOfflineLibrary,
  removeOfflineSong,
} from '../../services/offline-library';
import { ensureSourceId } from '../../services/music-resolver';
import {
  playSongQueue,
  setShuffleEnabled,
  stopMusicPlayer,
} from '../../services/player';

function identity(song: MusicSong) {
  return song.sourceId || song.id;
}

const SongCard = memo(function SongCard({
  song,
  active,
  progress,
  onPlay,
  onDownload,
  onLongPress,
}: {
  song: MusicSong;
  active: boolean;
  progress?: number;
  onPlay: (song: MusicSong) => void;
  onDownload: (song: MusicSong) => void;
  onLongPress: (song: MusicSong) => void;
}) {
  const downloading = progress !== undefined;
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      onPress={() => onPlay(song)}
      onLongPress={() => onLongPress(song)}
      activeOpacity={0.8}
      delayLongPress={450}
    >
      {song.artworkUrl ? (
        <Image source={{ uri: song.artworkUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="musical-note" size={22} color={active ? '#1db954' : '#555'} />
        </View>
      )}

      <View style={styles.meta}>
        <Text style={[styles.songTitle, active && styles.songTitleActive]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
        <Text style={styles.availability}>
          {song.localUri
            ? `Disponível offline${song.sizeBytes ? ` • ${formatBytes(song.sizeBytes)}` : ''}`
            : 'Somente online'}
        </Text>
        {downloading && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>

      {active && <Ionicons name="volume-medium" size={19} color="#1db954" />}

      {!song.localUri && (
        <TouchableOpacity
          accessibilityLabel="Baixar música"
          style={styles.downloadButton}
          onPress={(event) => {
            event.stopPropagation();
            if (!downloading) onDownload(song);
          }}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="arrow-down" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

export default function LibraryScreen() {
  const router = useRouter();
  const netInfo = useNetInfo();
  const activeItem = useActiveMediaItem();
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  const loadLibrary = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);

    const offlineSongs = await getOfflineLibrary();
    setSongs(offlineSongs);

    try {
      const serverSongs = await apiRequest<ApiLibrarySong[]>('/songs/my-library');
      const merged = await mergeWithOfflineLibrary(serverSongs.map(fromApiLibrarySong));
      const known = new Set(merged.map(identity));
      setSongs([...merged, ...offlineSongs.filter((song) => !known.has(identity(song)))]);
      setOfflineMode(false);
    } catch {
      setSongs(offlineSongs);
      setOfflineMode(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadLibrary();
    }, [loadLibrary])
  );

  const play = useCallback(async (song: MusicSong) => {
    const index = songs.findIndex((candidate) => identity(candidate) === identity(song));
    try {
      await playSongQueue(songs, index);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [songs]);

  const download = useCallback(async (song: MusicSong) => {
    let resolved = song;
    try {
      resolved = await ensureSourceId(song);
      const key = identity(resolved);
      setDownloadProgress((current) => ({ ...current, [key]: 0 }));

      const offlineSong = await downloadSong(resolved, ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) {
          setDownloadProgress((current) => ({
            ...current,
            [key]: Math.min(bytesWritten / totalBytes, 1),
          }));
        }
      });

      setSongs((current) => current.map((candidate) =>
        identity(candidate) === identity(song) ? offlineSong : candidate
      ));

      try {
        await apiRequest<void>('/songs/save', {
          method: 'POST',
          json: true,
          body: JSON.stringify({
            title: offlineSong.title,
            artist: offlineSong.artist,
            uri: offlineSong.localUri,
            coverUrl: offlineSong.artworkUrl,
            sourceId: offlineSong.sourceId,
          }),
        });
      } catch {}
    } catch (error) {
      Alert.alert('Erro no download', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      const key = identity(resolved);
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, []);

  const removeFromAccount = useCallback(async (song: MusicSong) => {
    try {
      if (netInfo.isConnected === false) {
        throw new Error('Conecte-se à internet para remover a música da conta.');
      }
      await apiRequest<void>(`/songs/remove/${encodeURIComponent(song.id)}`, { method: 'DELETE' });
      await removeOfflineSong(song);
      setSongs((current) => current.filter((candidate) => identity(candidate) !== identity(song)));
    } catch (error) {
      Alert.alert('Não foi possível remover', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [netInfo.isConnected]);

  const showSongActions = useCallback((song: MusicSong) => {
    const buttons = [
      { text: 'Cancelar', style: 'cancel' as const },
      ...(song.localUri ? [{
        text: 'Apagar download',
        style: 'destructive' as const,
        onPress: async () => {
          await removeOfflineSong(song);
          setSongs((current) => current.map((candidate) =>
            identity(candidate) === identity(song)
              ? { ...candidate, localUri: undefined, downloadedAt: undefined, sizeBytes: undefined }
              : candidate
          ));
        },
      }] : []),
      {
        text: 'Remover da conta',
        style: 'destructive' as const,
        onPress: () => { void removeFromAccount(song); },
      },
    ];
    Alert.alert(song.title, 'Escolha uma ação para esta música.', buttons);
  }, [removeFromAccount]);

  const toggleShuffle = () => {
    const next = !shuffle;
    setShuffle(next);
    setShuffleEnabled(next);
  };

  const logout = () => {
    Alert.alert('Sair', 'As músicas baixadas continuarão salvas neste celular.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: async () => {
          stopMusicPlayer(true);
          await clearSession();
          router.replace('/login');
        },
      },
    ]);
  };

  const downloadedCount = useMemo(() => songs.filter((song) => song.localUri).length, [songs]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Biblioteca de {username || 'músico'}</Text>
            <Text style={styles.headerTitle}>Suas músicas</Text>
            <Text style={styles.summary}>{downloadedCount} disponíveis offline</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="Alternar modo aleatório"
              style={[styles.headerButton, shuffle && styles.headerButtonActive]}
              onPress={toggleShuffle}
            >
              <Ionicons name="shuffle" size={20} color={shuffle ? '#1db954' : '#aaa'} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Sair" style={styles.headerButton} onPress={logout}>
              <Ionicons name="log-out-outline" size={21} color="#aaa" />
            </TouchableOpacity>
          </View>
        </View>

        {(offlineMode || netInfo.isConnected === false) && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color="#1db954" />
            <Text style={styles.offlineText}>Modo offline: reproduzindo arquivos salvos no celular.</Text>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => identity(item)}
            renderItem={({ item }) => (
              <SongCard
                song={item}
                active={activeItem?.mediaId === item.id}
                progress={downloadProgress[identity(item)]}
                onPlay={play}
                onDownload={download}
                onLongPress={showSongActions}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor="#1db954"
                colors={['#1db954']}
                onRefresh={() => {
                  setRefreshing(true);
                  void loadLibrary(false);
                }}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="download-outline" size={52} color="#444" />
                <Text style={styles.emptyTitle}>Sua biblioteca offline está vazia</Text>
                <Text style={styles.emptyText}>Pesquise uma música e toque na seta para baixá-la.</Text>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  greeting: { color: '#888', fontSize: 13 },
  headerTitle: { color: '#fff', fontSize: 25, fontWeight: '800', marginTop: 2 },
  summary: { color: '#1db954', fontSize: 12, marginTop: 5, fontWeight: '600' },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerButton: {
    width: 41,
    height: 41,
    borderRadius: 21,
    backgroundColor: '#202020',
    borderWidth: 1,
    borderColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonActive: { borderColor: '#1db95460', backgroundColor: '#1db95415' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#17281d',
    borderColor: '#275d38',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  offlineText: { color: '#a9d9b7', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 178 },
  card: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: '#292929',
    borderRadius: 13,
    padding: 10,
    marginBottom: 10,
  },
  cardActive: { borderColor: '#1db95470', backgroundColor: '#18231b' },
  cover: { width: 56, height: 56, borderRadius: 9, marginRight: 11 },
  coverPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 9,
    marginRight: 11,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, marginRight: 8 },
  songTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  songTitleActive: { color: '#1db954' },
  songArtist: { color: '#888', fontSize: 12, marginTop: 3 },
  availability: { color: '#686868', fontSize: 10, marginTop: 4 },
  downloadButton: {
    width: 37,
    height: 37,
    borderRadius: 19,
    backgroundColor: '#343434',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 7,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#343434',
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: 3, backgroundColor: '#1db954' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 30 },
  emptyTitle: { color: '#ddd', fontSize: 17, fontWeight: '700', marginTop: 15 },
  emptyText: { color: '#777', textAlign: 'center', fontSize: 13, marginTop: 7 },
});
