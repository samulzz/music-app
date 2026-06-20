import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { useActiveMediaItem } from '@rntp/player';

import GlobalMiniPlayer from '../../components/global-mini-player';
import type { ApiLibrarySong, MusicSong } from '../../types/music';
import { fromApiLibrarySong } from '../../types/music';
import { apiRequest } from '../../services/api';
import { downloadSong, mergeWithOfflineLibrary } from '../../services/offline-library';
import { ensureSourceId } from '../../services/music-resolver';
import { playSongQueue } from '../../services/player';

function identity(song: MusicSong) {
  return song.sourceId || song.id;
}

const PlaylistSongCard = memo(function PlaylistSongCard({
  song,
  active,
  busy,
  onPlay,
  onDownload,
}: {
  song: MusicSong;
  active: boolean;
  busy: boolean;
  onPlay: (song: MusicSong) => void;
  onDownload: (song: MusicSong) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.songCard, active && styles.songCardActive]}
      onPress={() => onPlay(song)}
      activeOpacity={0.82}
    >
      {song.artworkUrl ? (
        <Image source={{ uri: song.artworkUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="musical-note" size={20} color="#666" />
        </View>
      )}
      <View style={styles.meta}>
        <Text style={[styles.songTitle, active && styles.activeTitle]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
        <Text style={styles.availability}>{song.localUri ? 'Offline' : 'Online'}</Text>
      </View>
      {active && <Ionicons name="volume-medium" size={19} color="#1db954" />}
      <TouchableOpacity
        accessibilityLabel={song.localUri ? 'Música baixada' : 'Baixar música'}
        style={[styles.downloadButton, song.localUri && styles.downloadedButton]}
        onPress={(event) => {
          event.stopPropagation();
          if (!song.localUri && !busy) onDownload(song);
        }}
        disabled={Boolean(song.localUri) || busy}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons
            name={song.localUri ? 'checkmark' : 'arrow-down'}
            size={18}
            color={song.localUri ? '#1db954' : '#fff'}
          />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function PlaylistDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; title?: string }>();
  const router = useRouter();
  const netInfo = useNetInfo();
  const activeItem = useActiveMediaItem();
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);

  const playlistId = typeof params.id === 'string' ? params.id : '';
  const title = useMemo(
    () => typeof params.title === 'string' && params.title.trim() ? params.title : 'Playlist',
    [params.title]
  );
  const cacheKey = `nationmusics.playlist.${playlistId}.v1`;

  const readCache = useCallback(async () => {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as MusicSong[];
    } catch {
      return [];
    }
  }, [cacheKey]);

  const loadSongs = useCallback(async () => {
    if (!playlistId) return;
    setLoading(true);

    const cached = await readCache();
    if (cached.length) {
      setSongs(await mergeWithOfflineLibrary(cached));
    }

    try {
      const endpoint = playlistId === 'most-downloaded'
        ? '/playlists/most-downloaded/songs'
        : `/playlists/${encodeURIComponent(playlistId)}/songs`;
      const data = await apiRequest<ApiLibrarySong[]>(endpoint);
      const next = await mergeWithOfflineLibrary(data.map(fromApiLibrarySong));
      setSongs(next);
      setOfflineMode(false);
      await AsyncStorage.setItem(cacheKey, JSON.stringify(next.map(({ localUri, ...song }) => song)));
    } catch {
      setOfflineMode(true);
      if (!cached.length) setSongs([]);
    } finally {
      setLoading(false);
    }
  }, [cacheKey, playlistId, readCache]);

  useFocusEffect(
    useCallback(() => {
      void loadSongs();
    }, [loadSongs])
  );

  const play = useCallback(async (song: MusicSong) => {
    const index = songs.findIndex((candidate) => identity(candidate) === identity(song));
    try {
      await playSongQueue(songs, index);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [songs]);

  const playRandom = async () => {
    const playable = netInfo.isConnected === false
      ? songs.map((song, index) => ({ song, index })).filter(({ song }) => song.localUri)
      : songs.map((song, index) => ({ song, index }));
    if (!playable.length) {
      Alert.alert('Nenhuma música offline', 'Baixe ao menos uma música desta playlist.');
      return;
    }
    const selected = playable[Math.floor(Math.random() * playable.length)];
    await play(selected.song);
  };

  const saveOffline = useCallback(async (song: MusicSong) => {
    let key = identity(song);
    setBusyId(key);
    try {
      const resolved = await ensureSourceId(song);
      key = identity(resolved);
      const offlineSong = await downloadSong(resolved);
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

      Alert.alert('Salva offline', 'A música foi baixada para este celular.');
    } catch (error) {
      Alert.alert('Erro no download', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerMeta}>
            <Text style={styles.eyebrow}>PLAYLIST</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.summary}>{songs.length} músicas</Text>
          </View>
          <TouchableOpacity style={styles.shuffleButton} onPress={() => { void playRandom(); }}>
            <Ionicons name="shuffle" size={21} color="#121212" />
          </TouchableOpacity>
        </View>

        {(offlineMode || netInfo.isConnected === false) && (
          <View style={styles.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={17} color="#f2b84b" />
            <Text style={styles.offlineText}>Offline: somente músicas já baixadas podem tocar.</Text>
          </View>
        )}

        {loading && !songs.length ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#1db954" />
          </View>
        ) : (
          <FlatList
            data={songs}
            keyExtractor={(item) => identity(item)}
            renderItem={({ item }) => (
              <PlaylistSongCard
                song={item}
                active={activeItem?.mediaId === item.id}
                busy={busyId === identity(item)}
                onPlay={play}
                onDownload={saveOffline}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            windowSize={7}
            removeClippedSubviews
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="cloud-offline-outline" size={48} color="#555" />
                <Text style={styles.emptyTitle}>Playlist indisponível offline</Text>
                <Text style={styles.emptyText}>Abra esta playlist uma vez com internet para armazenar a lista.</Text>
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
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMeta: { flex: 1, marginHorizontal: 12 },
  eyebrow: { color: '#1db954', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  headerTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 2 },
  summary: { color: '#777', fontSize: 11, marginTop: 3 },
  shuffleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2b2518',
    borderColor: '#5a4825',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  offlineText: { color: '#d5bd83', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 150 },
  songCard: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292929',
    backgroundColor: '#1b1b1b',
    padding: 10,
    marginBottom: 10,
  },
  songCardActive: { borderColor: '#1db95460', backgroundColor: '#18231b' },
  cover: { width: 54, height: 54, borderRadius: 9, marginRight: 11 },
  coverPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 9,
    marginRight: 11,
    backgroundColor: '#252525',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flex: 1, marginRight: 7 },
  songTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  activeTitle: { color: '#1db954' },
  songArtist: { color: '#888', fontSize: 12, marginTop: 3 },
  availability: { color: '#696969', fontSize: 10, marginTop: 3 },
  downloadButton: {
    width: 37,
    height: 37,
    borderRadius: 19,
    marginLeft: 7,
    backgroundColor: '#343434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedButton: { backgroundColor: '#1db95418', borderWidth: 1, borderColor: '#1db95440' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 25 },
  emptyTitle: { color: '#ddd', fontWeight: '700', fontSize: 17, marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 7 },
});
