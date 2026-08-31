import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ApiSearchSong, MusicSong } from '../../types/music';
import { fromApiSearchSong } from '../../types/music';
import { apiRequest } from '../../services/api';
import { getSession } from '../../services/auth';
import { downloadSong } from '../../services/offline-library';
import { playSongQueue } from '../../services/player';

const SEARCH_DEBOUNCE_MS = 220;

const SearchCard = memo(function SearchCard({
  song,
  progress,
  downloaded,
  onPlay,
  onDownload,
}: {
  song: MusicSong;
  progress?: number;
  downloaded: boolean;
  onPlay: (song: MusicSong) => void;
  onDownload: (song: MusicSong) => void;
}) {
  const downloading = progress !== undefined;
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPlay(song)} activeOpacity={0.82}>
      {song.artworkUrl ? (
        <Image source={{ uri: song.artworkUrl }} style={styles.cover} />
      ) : (
        <View style={styles.coverPlaceholder}>
          <Ionicons name="musical-note" size={23} color="#555" />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.cardArtist} numberOfLines={1}>{song.artist}</Text>
        {downloading && (
          <View style={styles.downloadProgressTrack}>
            <View style={[styles.downloadProgressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>
      <TouchableOpacity
        accessibilityLabel={downloaded ? 'Música baixada' : 'Baixar música'}
        style={[styles.downloadButton, downloaded && styles.downloadedButton]}
        onPress={(event) => {
          event.stopPropagation();
          if (!downloaded && !downloading) onDownload(song);
        }}
        disabled={downloaded || downloading}
      >
        {downloading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons
            name={downloaded ? 'checkmark' : 'arrow-down'}
            size={19}
            color={downloaded ? '#1db954' : '#fff'}
          />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MusicSong[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [username, setUsername] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());
  const searchRequestId = useRef(0);

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  const searchCatalog = useCallback(async (rawValue = query) => {
    const value = rawValue.trim();
    const requestId = searchRequestId.current + 1;
    searchRequestId.current = requestId;

    if (!value) {
      setResults([]);
      setSearchError('');
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError('');
    try {
      const data = await apiRequest<ApiSearchSong[]>(
        `/songs/search?q=${encodeURIComponent(value)}`
      );
      if (requestId !== searchRequestId.current) return;
      const songs = data.map(fromApiSearchSong);
      setResults(songs);
      setSearchError(songs.length ? '' : 'Nenhuma musica pre-baixada encontrada.');
    } catch (error) {
      if (requestId !== searchRequestId.current) return;
      setResults([]);
      setSearchError(error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      if (requestId === searchRequestId.current) setSearching(false);
    }
  }, [query]);

  useEffect(() => {
    const value = query.trim();
    if (!value) return;

    const timer = setTimeout(() => {
      void searchCatalog(value);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, searchCatalog]);

  const changeQuery = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) {
      searchRequestId.current += 1;
      setResults([]);
      setSearchError('');
      setSearching(false);
    }
  }, []);

  const play = useCallback(async (song: MusicSong) => {
    try {
      await playSongQueue([song], 0);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, []);

  const download = useCallback(async (song: MusicSong) => {
    const identity = song.sourceId || song.id;
    setDownloadProgress((current) => ({ ...current, [identity]: 0 }));

    try {
      const offlineSong = await downloadSong(song, ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) {
          setDownloadProgress((current) => ({
            ...current,
            [identity]: Math.min(bytesWritten / totalBytes, 1),
          }));
        }
      });

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
      } catch {
        // O arquivo local é a fonte de verdade offline. A sincronização com a API pode ocorrer depois.
      }

      setDownloadedIds((current) => new Set(current).add(identity));
      Alert.alert('Download concluído', 'A música já pode ser ouvida sem internet.');
    } catch (error) {
      Alert.alert('Erro no download', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[identity];
        return next;
      });
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá, {username || 'músico'} 👋</Text>
            <Text style={styles.headerTitle}>O que vai ouvir hoje?</Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={19} color="#777" />
            <TextInput
              style={styles.searchInput}
              placeholder="Músicas ou artistas..."
              placeholderTextColor="#666"
              value={query}
              onChangeText={changeQuery}
              onSubmitEditing={() => searchCatalog(query)}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity style={styles.searchButton} onPress={() => searchCatalog(query)} disabled={searching}>
            {searching ? (
              <ActivityIndicator size="small" color="#121212" />
            ) : (
              <Ionicons name="arrow-forward" size={21} color="#121212" />
            )}
          </TouchableOpacity>
        </View>

        {Boolean(searchError) && (
          <View style={styles.catalogNotice}>
            <Ionicons name="information-circle-outline" size={17} color="#d5bd83" />
            <Text style={styles.catalogNoticeText}>{searchError}</Text>
          </View>
        )}

        <FlatList
          data={results}
          keyExtractor={(item) => item.sourceId || item.id}
          renderItem={({ item }) => {
            const identity = item.sourceId || item.id;
            return (
              <SearchCard
                song={item}
                progress={downloadProgress[identity]}
                downloaded={downloadedIds.has(identity)}
                onPlay={play}
                onDownload={download}
              />
            );
          }}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            !searching ? (
              <View style={styles.empty}>
                <Ionicons name="headset-outline" size={52} color="#444" />
                <Text style={styles.emptyTitle}>Encontre e baixe suas músicas</Text>
                <Text style={styles.emptyText}>Toque no resultado para ouvir ou use a seta para salvar offline.</Text>
              </View>
            ) : null
          }
        />
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
    marginBottom: 17,
  },
  greeting: { color: '#888', fontSize: 13 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 3 },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2b2518',
    borderColor: '#5a4825',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  offlineText: { color: '#d5bd83', fontSize: 12 },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 17 },
  searchBox: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#202020',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2b2518',
    borderColor: '#5a4825',
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  catalogNoticeText: { color: '#d5bd83', fontSize: 12, flex: 1 },
  list: { paddingBottom: 175 },
  card: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#292929',
    backgroundColor: '#1b1b1b',
    padding: 10,
    marginBottom: 10,
  },
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
  cardInfo: { flex: 1, marginRight: 8 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardArtist: { color: '#888', fontSize: 12, marginTop: 4 },
  downloadButton: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: '#343434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedButton: { backgroundColor: '#1db95418', borderWidth: 1, borderColor: '#1db95440' },
  downloadProgressTrack: {
    height: 3,
    marginTop: 7,
    backgroundColor: '#333',
    borderRadius: 2,
    overflow: 'hidden',
  },
  downloadProgressFill: { height: 3, backgroundColor: '#1db954' },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 28 },
  emptyTitle: { color: '#d8d8d8', fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyText: { color: '#777', fontSize: 13, textAlign: 'center', lineHeight: 18, marginTop: 7 },
});
