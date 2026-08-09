import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { type MediaItem } from '@rntp/player';

import GlobalMiniPlayer from '../../components/global-mini-player';
import type { ApiLibrarySong, MusicSong } from '../../types/music';
import { fromApiLibrarySong } from '../../types/music';
import { apiRequest } from '../../services/api';
import {
  canUseNativeBackgroundDownloads,
  downloadSong,
  downloadSongsWithNativeService,
  mergeWithOfflineLibrary,
} from '../../services/offline-library';
import { ensureSourceId } from '../../services/music-resolver';
import { playSongQueue, setShuffleEnabled, subscribeShuffleEnabled } from '../../services/player';
import { getDailyMix } from '../../services/recommendations';
import { useSyncedActiveMediaItem } from '../../services/player-state';
import { sortSongsAlphabetically } from '../../services/song-order';
import {
  notifyDownloadFinished,
  notifyDownloadProgress,
  notifyDownloadStarted,
} from '../../services/download-notifications';

function identity(song: MusicSong) {
  return song.sourceId || song.id;
}

function activeMediaMatches(activeItem: MediaItem | null, song: MusicSong) {
  const sourceId = song.sourceId?.trim();
  const activeSourceId = activeItem?.extras && typeof activeItem.extras === 'object'
    ? String(activeItem.extras.sourceId || '').trim()
    : '';
  return Boolean(
    activeItem
      && (
        activeItem.mediaId === song.id
        || activeItem.mediaId === sourceId
        || activeSourceId === sourceId
        || activeSourceId === song.id
      )
  );
}

async function saveDownloadedSong(offlineSong: MusicSong) {
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
}

const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;

type PlaylistSongsCache = {
  savedAt: number;
  songs: MusicSong[];
};

const PlaylistSongCard = memo(function PlaylistSongCard({
  song,
  active,
  busy,
  progress,
  selected,
  selectionMode,
  onPlay,
  onDownload,
  onSelect,
}: {
  song: MusicSong;
  active: boolean;
  busy: boolean;
  progress?: number;
  selected: boolean;
  selectionMode: boolean;
  onPlay: (song: MusicSong) => void;
  onDownload: (song: MusicSong) => void;
  onSelect: (song: MusicSong) => void;
}) {
  const downloading = busy || progress !== undefined;

  return (
    <TouchableOpacity
      style={[styles.songCard, active && styles.songCardActive, selected && styles.songCardSelected]}
      onPress={() => selectionMode ? onSelect(song) : onPlay(song)}
      onLongPress={() => onSelect(song)}
      activeOpacity={0.82}
    >
      {selectionMode && (
        <View style={[styles.selectionDot, selected && styles.selectionDotActive]}>
          {selected && <Ionicons name="checkmark" size={13} color="#121212" />}
        </View>
      )}
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
        {downloading && progress !== undefined && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        )}
      </View>
      {active && <Ionicons name="volume-medium" size={19} color="#1db954" />}
      {!selectionMode && <TouchableOpacity
        accessibilityLabel={song.localUri ? 'Música baixada' : 'Baixar música'}
        style={[styles.downloadButton, song.localUri && styles.downloadedButton]}
        onPress={(event) => {
          event.stopPropagation();
          if (!song.localUri && !downloading) onDownload(song);
        }}
        disabled={Boolean(song.localUri) || downloading}
      >
        {downloading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons
            name={song.localUri ? 'checkmark' : 'arrow-down'}
            size={18}
            color={song.localUri ? '#1db954' : '#fff'}
          />
        )}
      </TouchableOpacity>}
    </TouchableOpacity>
  );
});

export default function PlaylistDetailsScreen() {
  const params = useLocalSearchParams<{ id?: string; title?: string; kind?: string }>();
  const router = useRouter();
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  const activeItem = useSyncedActiveMediaItem();
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [bulkDownload, setBulkDownload] = useState<{ done: number; total: number } | null>(null);
  const [offlineMode, setOfflineMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removingSelection, setRemovingSelection] = useState(false);
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const playlistId = typeof params.id === 'string' ? params.id : '';
  const playlistKind = typeof params.kind === 'string' ? params.kind : 'global';
  const isPersonal = playlistKind === 'personal';
  const isLibrary = playlistKind === 'library';
  const isDaily = playlistKind === 'daily';
  const selectionMode = selectedIds.size > 0;
  const title = useMemo(
    () => typeof params.title === 'string' && params.title.trim() ? params.title : 'Playlist',
    [params.title]
  );
  const cacheKey = `nationmusics.playlist.${playlistKind}.${playlistId}.v2`;
  const legacyCacheKey = `nationmusics.playlist.${playlistKind}.${playlistId}.v1`;
  const bottomInset = Math.max(insets.bottom, 0);

  const readCache = useCallback(async (): Promise<PlaylistSongsCache> => {
    const raw = await AsyncStorage.getItem(cacheKey) || await AsyncStorage.getItem(legacyCacheKey);
    if (!raw) return { savedAt: 0, songs: [] };
    try {
      const parsed = JSON.parse(raw) as PlaylistSongsCache | MusicSong[];
      if (Array.isArray(parsed)) return { savedAt: 0, songs: parsed };
      if (Array.isArray(parsed.songs)) {
        return { savedAt: Number(parsed.savedAt) || 0, songs: parsed.songs };
      }
      return { savedAt: 0, songs: [] };
    } catch {
      return { savedAt: 0, songs: [] };
    }
  }, [cacheKey, legacyCacheKey]);

  const writeCache = useCallback(async (next: MusicSong[]) => {
    const savedAt = Date.now();
    lastRefreshAtRef.current = savedAt;
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ savedAt, songs: next.map(({ localUri, ...song }) => song) })
    );
  }, [cacheKey]);

  const loadSongs = useCallback(async (showSpinner = true, force = false) => {
    if (!playlistId) return;
    const cacheIsFresh = lastRefreshAtRef.current > 0
      && Date.now() - lastRefreshAtRef.current < PLAYLIST_CACHE_TTL_MS;

    if (!force && cacheIsFresh) {
      setLoading(false);
      return;
    }

    if (refreshInFlightRef.current) {
      if (showSpinner && !lastRefreshAtRef.current) setLoading(true);
      return refreshInFlightRef.current;
    }

    if (showSpinner && !lastRefreshAtRef.current) setLoading(true);

    const operation = (async () => {

    const cached = await readCache();
    if (cached.songs.length) {
      setSongs(sortSongsAlphabetically(await mergeWithOfflineLibrary(cached.songs)));
      lastRefreshAtRef.current = cached.savedAt;
    }

    try {
      const data = isDaily
        ? (await getDailyMix()).songs
        : await apiRequest<ApiLibrarySong[]>(isLibrary
          ? '/songs/my-library'
          : isPersonal
          ? `/playlists/personal/${encodeURIComponent(playlistId)}/songs`
          : playlistId === 'most-downloaded'
          ? '/playlists/most-downloaded/songs'
          : `/playlists/${encodeURIComponent(playlistId)}/songs`, {
            authenticated: isPersonal || isLibrary,
          });
      const merged = await mergeWithOfflineLibrary(data.map(fromApiLibrarySong));
      const next = isDaily ? merged : sortSongsAlphabetically(merged);
      setSongs(next);
      setOfflineMode(false);
      await writeCache(next);
    } catch {
      setOfflineMode(true);
      if (!cached.songs.length) setSongs([]);
    } finally {
      setLoading(false);
      refreshInFlightRef.current = null;
    }
    })();

    refreshInFlightRef.current = operation;
    return operation;
  }, [isDaily, isLibrary, isPersonal, playlistId, readCache, writeCache]);

  const hydrateSongs = useCallback(async () => {
    if (!playlistId) return;
    const cached = await readCache();
    if (cached.songs.length) {
      setSongs(sortSongsAlphabetically(await mergeWithOfflineLibrary(cached.songs)));
      lastRefreshAtRef.current = cached.savedAt;
      setLoading(false);
      void loadSongs(false);
      return;
    }

    void loadSongs(true, true);
  }, [loadSongs, playlistId, readCache]);

  useEffect(() => {
    hydratedRef.current = false;
    lastRefreshAtRef.current = 0;
    refreshInFlightRef.current = null;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSongs([]);
      setLoading(true);
      setBusyId(null);
      setDownloadProgress({});
      setBulkDownload(null);
    });
    return () => { active = false; };
  }, [cacheKey]);

  useFocusEffect(
    useCallback(() => {
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        void hydrateSongs();
        return;
      }

      void loadSongs(false);
    }, [hydrateSongs, loadSongs])
  );

  useEffect(() => subscribeShuffleEnabled(setShuffle), []);

  const play = useCallback(async (song: MusicSong) => {
    const index = songs.findIndex((candidate) => identity(candidate) === identity(song));
    try {
      await playSongQueue(songs, index);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [songs]);

  const playAll = async () => {
    const playable = netInfo.isConnected === false
      ? songs.map((song, index) => ({ song, index })).filter(({ song }) => song.localUri)
      : songs.map((song, index) => ({ song, index }));
    if (!playable.length) {
      Alert.alert('Nenhuma música offline', 'Baixe ao menos uma música desta playlist.');
      return;
    }
    const selected = shuffle ? playable[Math.floor(Math.random() * playable.length)] : playable[0];
    await play(selected.song);
  };

  const toggleShuffle = () => {
    setShuffleEnabled(!shuffle);
  };

  const saveOffline = useCallback(async (song: MusicSong) => {
    let key = identity(song);
    setBusyId(key);
    try {
      await notifyDownloadStarted(1);
      const resolved = await ensureSourceId(song);
      key = identity(resolved);
      setDownloadProgress((current) => ({ ...current, [key]: 0, [song.id]: 0 }));
      await notifyDownloadProgress({
        done: 0,
        total: 1,
        currentTitle: resolved.title,
        percent: 0,
        force: true,
      });
      const offlineSong = await downloadSong(resolved, ({ bytesWritten, totalBytes }) => {
        if (totalBytes > 0) {
          const progress = Math.min(bytesWritten / totalBytes, 1);
          setDownloadProgress((current) => ({ ...current, [key]: progress, [song.id]: progress }));
          void notifyDownloadProgress({
            done: 0,
            total: 1,
            currentTitle: resolved.title,
            percent: progress,
          });
        }
      });
      setSongs((current) => current.map((candidate) =>
        identity(candidate) === identity(song) ? offlineSong : candidate
      ));

      await saveDownloadedSong(offlineSong);
      await notifyDownloadProgress({
        done: 1,
        total: 1,
        currentTitle: offlineSong.title,
        percent: 1,
        force: true,
      });
      await notifyDownloadFinished(1);

      Alert.alert('Salva offline', 'A música foi baixada para este celular.');
    } catch (error) {
      Alert.alert('Erro no download', error instanceof Error ? error.message : 'Tente novamente.');
      await notifyDownloadFinished(1, 1);
    } finally {
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[key];
        delete next[song.id];
        return next;
      });
      setBusyId(null);
    }
  }, []);

  const downloadMany = useCallback(async (targets: MusicSong[]) => {
    const pending = targets.filter((song) => !song.localUri);
    if (!pending.length) {
      Alert.alert('Tudo pronto', 'Todas as musicas desta playlist ja estao disponiveis offline.');
      return;
    }

    if (netInfo.isConnected === false) {
      Alert.alert('Voce esta offline', 'Conecte-se a internet para baixar novas musicas.');
      return;
    }

    const failures: string[] = [];
    setBulkDownload({ done: 0, total: pending.length });

    if (canUseNativeBackgroundDownloads()) {
      const nativeTargets: MusicSong[] = [];
      const nativeResolveFailures: string[] = [];

      for (const song of pending) {
        try {
          const resolved = await ensureSourceId(song);
          nativeTargets.push(resolved);
          const key = identity(resolved);
          setDownloadProgress((current) => ({ ...current, [key]: 0, [song.id]: 0 }));
        } catch {
          nativeResolveFailures.push(song.title);
        }
      }

      let nativeResult: Awaited<ReturnType<typeof downloadSongsWithNativeService>> = null;

      try {
        nativeResult = nativeTargets.length
          ? await downloadSongsWithNativeService(nativeTargets, (event) => {
            if (event.total) {
              setBulkDownload({ done: event.done || 0, total: event.total });
            }

            const eventKey = event.sourceId || event.id;
            if (event.type === 'progress' && eventKey) {
              setDownloadProgress((current) => ({
                ...current,
                [eventKey]: Math.min(Math.max((event.currentPercent || 0) / 100, 0), 1),
              }));
            }

            if (event.type === 'song-complete' && event.song) {
              const offlineSong = event.song;
              setSongs((current) => current.map((candidate) =>
                identity(candidate) === identity(offlineSong) || candidate.id === offlineSong.id
                  ? offlineSong
                  : candidate
              ));
              setDownloadProgress((current) => {
                const next = { ...current };
                delete next[identity(offlineSong)];
                delete next[offlineSong.id];
                if (offlineSong.sourceId) delete next[offlineSong.sourceId];
                return next;
              });
            }

            if (event.type === 'song-failed' && event.failure) {
              const failedKey = event.failure.sourceId || event.failure.id;
              if (failedKey) {
                setDownloadProgress((current) => {
                  const next = { ...current };
                  delete next[failedKey];
                  return next;
                });
              }
            }
            })
          : null;
      } catch {
        setDownloadProgress((current) => {
          const next = { ...current };
          for (const song of nativeTargets) {
            delete next[identity(song)];
            delete next[song.id];
            if (song.sourceId) delete next[song.sourceId];
          }
          return next;
        });
      }

      if (nativeResult) {
        const downloaded = nativeResult.downloaded;
        failures.push(...nativeResolveFailures);
        nativeResult.failures.forEach((failure) => failures.push(failure.title || 'Musica'));

        if (downloaded.length) {
          setSongs((current) => current.map((candidate) => {
            const replacement = downloaded.find((song) =>
              identity(song) === identity(candidate) || song.id === candidate.id
            );
            return replacement || candidate;
          }));

          for (const offlineSong of downloaded) {
            await saveDownloadedSong(offlineSong);
          }
        }

        setDownloadProgress((current) => {
          const next = { ...current };
          for (const song of [...pending, ...nativeTargets]) {
            delete next[identity(song)];
            delete next[song.id];
            if (song.sourceId) delete next[song.sourceId];
          }
          return next;
        });
        setBulkDownload(null);
        void loadSongs(false, true);

        if (failures.length) {
          Alert.alert('Download concluido com pendencias', `${failures.length} musica${failures.length === 1 ? '' : 's'} nao baixaram agora. Tente novamente depois.`);
        } else {
          Alert.alert('Downloads prontos', 'As musicas foram baixadas para este celular.');
        }
        return;
      }
    }

    await notifyDownloadStarted(pending.length);

    for (let index = 0; index < pending.length; index += 1) {
      const original = pending[index];
      let resolved = original;
      let key = identity(original);

      try {
        resolved = await ensureSourceId(original);
        key = identity(resolved);
        setDownloadProgress((current) => ({ ...current, [key]: 0, [original.id]: 0 }));
        await notifyDownloadProgress({
          done: index,
          total: pending.length,
          currentTitle: resolved.title,
          percent: 0,
          force: true,
        });

        const offlineSong = await downloadSong(resolved, ({ bytesWritten, totalBytes }) => {
          if (totalBytes > 0) {
            const progress = Math.min(bytesWritten / totalBytes, 1);
            setDownloadProgress((current) => ({ ...current, [key]: progress, [original.id]: progress }));
            void notifyDownloadProgress({
              done: index,
              total: pending.length,
              currentTitle: resolved.title,
              percent: progress,
            });
          }
        });

        setSongs((current) => current.map((candidate) =>
          identity(candidate) === identity(resolved) || identity(candidate) === identity(original)
            ? offlineSong
            : candidate
        ));
        await saveDownloadedSong(offlineSong);
      } catch {
        failures.push(original.title);
      } finally {
        setDownloadProgress((current) => {
          const next = { ...current };
          delete next[key];
          delete next[original.id];
          if (resolved.sourceId) delete next[resolved.sourceId];
          return next;
        });
        setBulkDownload({ done: index + 1, total: pending.length });
        void notifyDownloadProgress({
          done: index + 1,
          total: pending.length,
          currentTitle: original.title,
          percent: 1,
          force: true,
        });
      }
    }

    setBulkDownload(null);
    await notifyDownloadFinished(pending.length, failures.length);
    void loadSongs(false, true);

    if (failures.length) {
      Alert.alert('Download concluido com pendencias', `${failures.length} musica${failures.length === 1 ? '' : 's'} nao baixaram agora. Tente novamente depois.`);
    } else {
      Alert.alert('Downloads prontos', 'As musicas foram baixadas para este celular.');
    }
  }, [loadSongs, netInfo.isConnected]);

  const downloadAll = useCallback(() => {
    if (bulkDownload) return;

    const pending = songs.filter((song) => !song.localUri);
    if (!pending.length) {
      Alert.alert('Tudo pronto', 'Todas as musicas desta playlist ja estao disponiveis offline.');
      return;
    }

    Alert.alert('Baixar playlist', `Baixar ${pending.length} musica${pending.length === 1 ? '' : 's'} para ouvir offline?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Baixar',
        onPress: () => {
          void downloadMany(pending);
        },
      },
    ]);
  }, [bulkDownload, downloadMany, songs]);

  const toggleSelection = useCallback((song: MusicSong) => {
    const key = identity(song);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const selectedSongs = useMemo(
    () => songs.filter((song) => selectedIds.has(identity(song))),
    [selectedIds, songs]
  );

  const removeSelected = useCallback(() => {
    if ((!isPersonal && !isLibrary) || !selectedSongs.length || removingSelection) return;
    const count = selectedSongs.length;
    Alert.alert(isLibrary ? 'Remover de Minhas Músicas' : 'Remover da playlist', `Remover ${count} música${count === 1 ? '' : 's'} ${isLibrary ? 'da sua conta' : 'desta playlist'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setRemovingSelection(true);
          try {
            for (const song of selectedSongs) {
              await apiRequest<void>(isLibrary
                ? `/songs/remove/${encodeURIComponent(song.id)}`
                : `/playlists/personal/${encodeURIComponent(playlistId)}/songs/${encodeURIComponent(song.id)}`,
              { method: 'DELETE' });
            }
            const removed = new Set(selectedSongs.map(identity));
            const next = songs.filter((candidate) => !removed.has(identity(candidate)));
            setSongs(next);
            setSelectedIds(new Set());
            await writeCache(next);
          } catch (error) {
            Alert.alert('Não foi possível remover', error instanceof Error ? error.message : 'Tente novamente.');
          } finally {
            setRemovingSelection(false);
          }
        },
      },
    ]);
  }, [isLibrary, isPersonal, playlistId, removingSelection, selectedSongs, songs, writeCache]);

  const downloadedCount = useMemo(() => songs.filter((song) => song.localUri).length, [songs]);
  const progressForSong = useCallback((song: MusicSong) => (
    downloadProgress[identity(song)]
    ?? downloadProgress[song.id]
    ?? (song.sourceId ? downloadProgress[song.sourceId] : undefined)
  ), [downloadProgress]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerMeta}>
            <Text style={styles.eyebrow}>{isDaily ? 'FEITA PARA VOCÊ' : isLibrary ? 'BIBLIOTECA' : isPersonal ? 'SUA PLAYLIST' : 'PLAYLIST'}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.summary}>
              {songs.length} {songs.length === 1 ? 'música' : 'músicas'}{downloadedCount ? ` / ${downloadedCount} offline` : ''}
            </Text>
            {bulkDownload && (
              <Text style={styles.bulkSummary}>Baixando {bulkDownload.done}/{bulkDownload.total}</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel="Baixar playlist para offline"
              style={[styles.downloadAllButton, bulkDownload && styles.downloadAllButtonActive]}
              onPress={downloadAll}
              disabled={!songs.length || Boolean(bulkDownload)}
            >
              {bulkDownload ? (
                <ActivityIndicator size="small" color="#1db954" />
              ) : (
                <Ionicons name="cloud-download-outline" size={21} color="#ddd" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={shuffle ? 'Reproduzir playlist aleatória' : 'Reproduzir playlist'}
              style={styles.playAllButton}
              onPress={() => { void playAll(); }}
              disabled={!songs.length}
            >
              <Ionicons name="play" size={21} color="#121212" />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Alternar modo aleatório"
              style={[styles.shuffleButton, shuffle && styles.shuffleButtonActive]}
              onPress={toggleShuffle}
            >
              <Ionicons name="shuffle" size={21} color={shuffle ? '#1db954' : '#ddd'} />
            </TouchableOpacity>
          </View>
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
                active={activeMediaMatches(activeItem, item)}
                busy={busyId === identity(item)}
                progress={progressForSong(item)}
                selected={selectedIds.has(identity(item))}
                selectionMode={selectionMode}
                onPlay={play}
                onDownload={saveOffline}
                onSelect={toggleSelection}
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
                <Text style={styles.emptyTitle}>{isLibrary ? 'Nenhuma música salva' : 'Playlist indisponível offline'}</Text>
                <Text style={styles.emptyText}>{isLibrary ? 'Salve músicas pela busca para encontrá-las aqui.' : 'Abra esta playlist uma vez com internet para armazenar a lista.'}</Text>
              </View>
            }
          />
        )}
        {selectionMode && (
          <View style={[styles.selectionBar, { bottom: 10 + bottomInset }]}>
            <View style={styles.selectionInfo}>
              <Text style={styles.selectionCount}>{selectedIds.size}</Text>
              <Text style={styles.selectionLabel}>selecionada{selectedIds.size === 1 ? '' : 's'}</Text>
            </View>
            <TouchableOpacity style={styles.selectionAction} onPress={() => setSelectedIds(new Set(songs.map(identity)))}>
              <Ionicons name="checkmark-done" size={20} color="#ddd" />
              <Text style={styles.selectionActionText}>Todas</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionAction} onPress={() => { setSelectedIds(new Set()); void downloadMany(selectedSongs); }}>
              <Ionicons name="cloud-download-outline" size={20} color="#ddd" />
              <Text style={styles.selectionActionText}>Baixar</Text>
            </TouchableOpacity>
            {(isPersonal || isLibrary) && (
              <TouchableOpacity style={styles.selectionAction} onPress={removeSelected} disabled={removingSelection}>
                {removingSelection ? <ActivityIndicator size="small" color="#ff8585" /> : <Ionicons name="trash-outline" size={20} color="#ff8585" />}
                <Text style={styles.selectionDangerText}>Remover</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.selectionClose} onPress={() => setSelectedIds(new Set())}>
              <Ionicons name="close" size={21} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      {!selectionMode && <GlobalMiniPlayer bottomOffset={12 + bottomInset} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  songCardSelected: { borderColor: '#1db95488', backgroundColor: '#1db95412' },
  selectionDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  selectionDotActive: { borderColor: '#1db954', backgroundColor: '#1db954' },
  selectionBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#202020',
    elevation: 30,
    zIndex: 80,
  },
  selectionInfo: { flex: 1 },
  selectionCount: { color: '#1db954', fontSize: 19, fontWeight: '900' },
  selectionLabel: { color: '#999', fontSize: 10 },
  selectionAction: { minWidth: 52, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 5 },
  selectionActionText: { color: '#ddd', fontSize: 9, fontWeight: '700' },
  selectionDangerText: { color: '#ff8585', fontSize: 9, fontWeight: '700' },
  selectionClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#303030', marginLeft: 4 },
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
  bulkSummary: { color: '#aaa', fontSize: 11, marginTop: 3 },
  headerActions: { flexDirection: 'row', gap: 8 },
  downloadAllButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadAllButtonActive: { borderColor: '#1db95460', backgroundColor: '#1db95415' },
  playAllButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#1db954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#303030',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleButtonActive: { borderColor: '#1db95460', backgroundColor: '#1db95415' },
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
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#343434',
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: 3, backgroundColor: '#1db954' },
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
