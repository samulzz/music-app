import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';

import type { ApiPlaylist, MusicSong } from '../../types/music';
import { fromApiLibrarySong } from '../../types/music';
import { apiRequest, OfflineError } from '../../services/api';
import { getSession } from '../../services/auth';
import { getPersonalizedHome, type PersonalizedHome } from '../../services/recommendations';
import { playSongQueue, seekToPosition } from '../../services/player';
import { MUSIC_GENRES } from '../../constants/music-genres';

type HomePlaylist = {
  id: string;
  title: string;
  description: string;
  iconUrl?: string;
  kind: 'daily' | 'most-downloaded' | 'global';
};

const CACHE_KEY = 'nationmusics.home-playlists.v3';
const LEGACY_CACHE_KEY = 'nationmusics.home-playlists.v1';
const HOME_CACHE_TTL_MS = 5 * 60 * 1000;

type HomePlaylistsCache = {
  savedAt: number;
  playlists: HomePlaylist[];
  personalized?: PersonalizedHome | null;
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
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playlists, setPlaylists] = useState<HomePlaylist[]>([]);
  const [personalized, setPersonalized] = useState<PersonalizedHome | null>(null);
  const [offline, setOffline] = useState(false);
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  const readCache = useCallback(async (): Promise<HomePlaylistsCache> => {
    const raw = await AsyncStorage.getItem(CACHE_KEY) || await AsyncStorage.getItem(LEGACY_CACHE_KEY);
    if (!raw) return { savedAt: 0, playlists: [], personalized: null };
    try {
      const parsed = JSON.parse(raw) as HomePlaylistsCache | HomePlaylist[];
      if (Array.isArray(parsed)) return { savedAt: 0, playlists: parsed, personalized: null };
      if (Array.isArray(parsed.playlists)) {
        return { savedAt: Number(parsed.savedAt) || 0, playlists: parsed.playlists, personalized: parsed.personalized || null };
      }
      return { savedAt: 0, playlists: [], personalized: null };
    } catch {
      return { savedAt: 0, playlists: [], personalized: null };
    }
  }, []);

  const writeCache = useCallback(async (next: HomePlaylist[], home: PersonalizedHome | null) => {
    const savedAt = Date.now();
    lastRefreshAtRef.current = savedAt;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, playlists: next, personalized: home }));
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
      const [globalData, home] = await Promise.all([
        apiRequest<ApiPlaylist[]>('/playlists/global', { authenticated: false }),
        getPersonalizedHome().catch(() => null),
      ]);
      const dailyMix = home?.dailyMix || null;
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
      setPersonalized(home);
      setOffline(false);
      await writeCache(next, home);
    } catch (error) {
      const cached = await readCache();
      if (cached.playlists.length) {
        setPlaylists(cached.playlists);
        setPersonalized(cached.personalized || null);
        lastRefreshAtRef.current = cached.savedAt;
      }
      setOffline(error instanceof OfflineError);
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
  }, [readCache, writeCache]);

  const hydrateHome = useCallback(async () => {
    const cached = await readCache();
    if (cached.playlists.length) {
      setPlaylists(cached.playlists);
      setPersonalized(cached.personalized || null);
      lastRefreshAtRef.current = cached.savedAt;
      setLoading(false);
      void loadHome(false, true);
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

  const openGenre = useCallback((query: string) => {
    router.push({
      pathname: '/(tabs)/search' as never,
      params: { genre: query },
    });
  }, [router]);

  const playHomeSong = useCallback(async (song: MusicSong, positionSeconds = 0) => {
    try {
      await playSongQueue([song], 0, 'manual');
      if (positionSeconds > 0) seekToPosition(positionSeconds);
    } catch (error) {
      Alert.alert('Não foi possível tocar', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, []);

  const resumePlayback = useCallback(async (item: NonNullable<PersonalizedHome['continueListening']>) => {
    const fallback: MusicSong = { ...item.song, id: item.song.id || item.song.sourceId || '' };
    try {
      let queue = [fallback];
      const context = item.contextId ? { type: item.contextType || 'global', id: item.contextId, name: item.contextName || '' } : null;
      if (context) {
        const endpoint = context.type === 'daily'
          ? ''
          : context.type === 'most-downloaded'
            ? '/playlists/most-downloaded/songs'
            : context.type === 'personal'
              ? `/playlists/personal/${encodeURIComponent(context.id)}/songs`
              : context.type === 'library'
                ? '/songs/my-library'
                : `/playlists/${encodeURIComponent(context.id)}/songs`;
        const raw = context.type === 'daily'
          ? personalized?.dailyMix.songs || []
          : await apiRequest<import('../../types/music').ApiLibrarySong[]>(endpoint);
        const restored = raw.map(fromApiLibrarySong);
        if (restored.length) queue = restored;
      }
      const target = queue.findIndex((song) => (song.sourceId || song.id) === (fallback.sourceId || fallback.id));
      await playSongQueue(queue, target >= 0 ? target : 0, 'playlist', context);
      seekToPosition(item.positionSeconds);
    } catch (error) {
      Alert.alert('Não foi possível continuar', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [personalized]);

  const resume = personalized?.continueListening;
  const recentSongs = (personalized?.recentSongs || []).map(fromApiLibrarySong);
  const recommendedSongs = (personalized?.recommendedSongs || []).map(fromApiLibrarySong);

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
            ListHeaderComponent={(playlists[0] || personalized) ? (
              <View>
                {resume && (
                  <TouchableOpacity
                    style={styles.continueCard}
                    onPress={() => void resumePlayback(resume)}
                    activeOpacity={0.86}
                  >
                    {resume.song.artworkUrl ? <Image source={{ uri: resume.song.artworkUrl }} style={styles.continueCover} /> : (
                      <View style={[styles.continueCover, styles.artPlaceholder]}><Ionicons name="musical-note" size={28} color="#1db954" /></View>
                    )}
                    <View style={styles.continueMeta}>
                      <Text style={styles.featuredEyebrow}>CONTINUAR OUVINDO</Text>
                      <Text style={styles.continueTitle} numberOfLines={1}>{resume.song.title}</Text>
                      <Text style={styles.continueArtist} numberOfLines={1}>{resume.song.artist}</Text>
                      <View style={styles.resumeTrack}><View style={[styles.resumeProgress, { width: `${Math.min(100, (resume.positionSeconds / Math.max(1, resume.durationSeconds)) * 100)}%` }]} /></View>
                    </View>
                    <View style={styles.featuredPlay}><Ionicons name="play" size={20} color="#111" /></View>
                  </TouchableOpacity>
                )}
                {playlists[0] && <TouchableOpacity style={styles.featuredCard} onPress={() => openPlaylist(playlists[0])} activeOpacity={0.84}>
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
                </TouchableOpacity>}
                {recentSongs.length > 0 && <>
                  <Text style={styles.sectionTitle}>Tocadas recentemente</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalShelf}>
                    {recentSongs.map((song) => (
                      <TouchableOpacity key={`recent-${song.id}`} style={styles.songCard} onPress={() => void playHomeSong(song)} activeOpacity={0.82}>
                        {song.artworkUrl ? <Image source={{ uri: song.artworkUrl }} style={styles.songCover} /> : <View style={[styles.songCover, styles.artPlaceholder]}><Ionicons name="musical-note" size={24} color="#1db954" /></View>}
                        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>}
                {!!personalized?.topArtists.length && <>
                  <Text style={styles.sectionTitle}>Seus artistas</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalShelf}>
                    {personalized.topArtists.map((artist) => (
                      <TouchableOpacity key={artist.name} style={styles.artistCard} onPress={() => router.push({ pathname: '/artist/[name]' as never, params: { name: artist.name } })} activeOpacity={0.82}>
                        {artist.artworkUrl ? <Image source={{ uri: artist.artworkUrl }} style={styles.artistCover} /> : <View style={[styles.artistCover, styles.artPlaceholder]}><Ionicons name="person" size={28} color="#1db954" /></View>}
                        <Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>}
                {recommendedSongs.length > 0 && <>
                  <Text style={styles.sectionTitle}>{personalized?.recommendationReason || 'Escolhidas para você'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalShelf}>
                    {recommendedSongs.map((song) => (
                      <TouchableOpacity key={`recommended-${song.id}`} style={styles.songCard} onPress={() => void playHomeSong(song)} activeOpacity={0.82}>
                        {song.artworkUrl ? <Image source={{ uri: song.artworkUrl }} style={styles.songCover} /> : <View style={[styles.songCover, styles.artPlaceholder]}><Ionicons name="sparkles" size={24} color="#1db954" /></View>}
                        <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                        <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>}
                {!!personalized?.frequentPlaylists.length && <>
                  <Text style={styles.sectionTitle}>Atalhos para você</Text>
                  <View style={styles.shortcutGrid}>
                    {personalized.frequentPlaylists.slice(0, 6).map((playlist) => (
                      <TouchableOpacity key={playlist.id} style={styles.shortcutCard} onPress={() => openPlaylist({ id: String(playlist.id), title: playlist.name, description: playlist.description || '', iconUrl: playlist.iconUrl, kind: 'global' })} activeOpacity={0.82}>
                        {playlist.iconUrl ? <Image source={{ uri: playlist.iconUrl }} style={styles.shortcutCover} /> : <View style={[styles.shortcutCover, styles.artPlaceholder]}><Ionicons name="albums" size={20} color="#1db954" /></View>}
                        <Text style={styles.shortcutName} numberOfLines={2}>{playlist.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}
                <Text style={styles.sectionTitle}>Explore por gênero</Text>
                <View style={styles.genreGrid}>
                  {MUSIC_GENRES.map((genre) => (
                    <TouchableOpacity
                      key={genre.query}
                      style={[styles.genreCard, { backgroundColor: genre.color }]}
                      onPress={() => openGenre(genre.query)}
                      activeOpacity={0.82}
                    >
                      <Text style={styles.genreName}>{genre.name}</Text>
                      <Ionicons name={genre.icon} size={25} color="#ffffffcc" />
                    </TouchableOpacity>
                  ))}
                </View>
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
  artPlaceholder: { backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' },
  continueCard: {
    minHeight: 96,
    borderRadius: 16,
    backgroundColor: '#1d2520',
    borderWidth: 1,
    borderColor: '#2d4836',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    marginBottom: 14,
  },
  continueCover: { width: 72, height: 72, borderRadius: 10, marginRight: 12 },
  continueMeta: { flex: 1, minWidth: 0, paddingRight: 10 },
  continueTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 3 },
  continueArtist: { color: '#9da8a0', fontSize: 11, marginTop: 3 },
  resumeTrack: { height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: '#3b433e', marginTop: 9 },
  resumeProgress: { height: '100%', borderRadius: 2, backgroundColor: '#1db954' },
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
  horizontalShelf: { gap: 11, paddingBottom: 23, paddingRight: 6 },
  songCard: { width: 126 },
  songCover: { width: 126, height: 126, borderRadius: 10, marginBottom: 8 },
  songTitle: { color: '#f4f4f4', fontSize: 12, fontWeight: '800' },
  songArtist: { color: '#7f8882', fontSize: 10, marginTop: 3 },
  artistCard: { width: 102, alignItems: 'center' },
  artistCover: { width: 94, height: 94, borderRadius: 47, marginBottom: 8 },
  artistName: { color: '#eee', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 23 },
  shortcutCard: { width: '48.5%', minHeight: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: '#232323', flexDirection: 'row', alignItems: 'center' },
  shortcutCover: { width: 56, height: 56, borderRadius: 0, marginRight: 9 },
  shortcutName: { flex: 1, color: '#eee', fontSize: 11, fontWeight: '800', lineHeight: 15, paddingRight: 7 },
  genreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 23 },
  genreCard: {
    width: '48.5%',
    minHeight: 68,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  genreName: { color: '#fff', fontSize: 15, fontWeight: '900' },
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
