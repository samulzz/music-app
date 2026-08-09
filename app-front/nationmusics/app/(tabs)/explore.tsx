import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { type MediaItem } from '@rntp/player';

import type { ApiLibrarySong, ApiPlaylist, MusicSong } from '../../types/music';
import { fromApiLibrarySong } from '../../types/music';
import { apiRequest } from '../../services/api';
import { clearSession, getSession } from '../../services/auth';
import {
  downloadSong,
  downloadSongsWithNativeService,
  formatBytes,
  getOfflineLibrary,
  mergeWithOfflineLibrary,
  removeOfflineSong,
} from '../../services/offline-library';
import { ensureSourceId } from '../../services/music-resolver';
import { sortSongsAlphabetically } from '../../services/song-order';
import {
  notifyDownloadFinished,
  notifyDownloadProgress,
  notifyDownloadStarted,
} from '../../services/download-notifications';
import {
  playSongQueue,
  setShuffleEnabled,
  subscribeShuffleEnabled,
  stopMusicPlayer,
} from '../../services/player';
import { useSyncedActiveMediaItem } from '../../services/player-state';

const LIBRARY_CACHE_KEY = 'nationmusics.library-cache.v1';
const LIBRARY_CACHE_TTL_MS = 5 * 60 * 1000;

type LibraryCache = {
  savedAt: number;
  songs: MusicSong[];
};

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

async function readLibraryCache() {
  const raw = await AsyncStorage.getItem(LIBRARY_CACHE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LibraryCache;
    if (!parsed || !Array.isArray(parsed.songs)) return null;
    return {
      savedAt: Number(parsed.savedAt) || 0,
      songs: parsed.songs,
    };
  } catch {
    return null;
  }
}

async function writeLibraryCache(songs: MusicSong[]) {
  await AsyncStorage.setItem(
    LIBRARY_CACHE_KEY,
    JSON.stringify({ savedAt: Date.now(), songs } satisfies LibraryCache)
  );
}

function includeOfflineOnlySongs(serverSongs: MusicSong[], offlineSongs: MusicSong[]) {
  const known = new Set(serverSongs.map(identity));
  return sortSongsAlphabetically([
    ...serverSongs,
    ...offlineSongs.filter((song) => !known.has(identity(song))),
  ]);
}

const SongCard = memo(function SongCard({
  song,
  active,
  progress,
  onPlay,
  onDownload,
  onLongPress,
  selected,
  selectionMode,
  onToggleSelection,
}: {
  song: MusicSong;
  active: boolean;
  progress?: number;
  onPlay: (song: MusicSong) => void;
  onDownload: (song: MusicSong) => void;
  onLongPress: (song: MusicSong) => void;
  selected: boolean;
  selectionMode: boolean;
  onToggleSelection: (song: MusicSong) => void;
}) {
  const downloading = progress !== undefined;
  return (
    <TouchableOpacity
      style={[styles.card, active && styles.cardActive]}
      onPress={() => selectionMode ? onToggleSelection(song) : onPlay(song)}
      onLongPress={() => onLongPress(song)}
      activeOpacity={0.8}
      delayLongPress={450}
    >
      {selectionMode && (
        <View style={[styles.selectionDot, selected && styles.selectionDotActive]}>
          {selected && <Ionicons name="checkmark" size={14} color="#121212" />}
        </View>
      )}

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
            if (selectionMode) onToggleSelection(song);
            else if (!downloading) onDownload(song);
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
  const activeItem = useSyncedActiveMediaItem();
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [bulkDownload, setBulkDownload] = useState<{ done: number; total: number } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionsVisible, setActionsVisible] = useState(false);
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    getSession().then((session) => setUsername(session?.username || '')).catch(() => {});
  }, []);

  useEffect(() => subscribeShuffleEnabled(setShuffle), []);

  const loadLibrary = useCallback((showSpinner = true, force = false) => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const recentlyUpdated = lastRefreshAtRef.current
      && Date.now() - lastRefreshAtRef.current < LIBRARY_CACHE_TTL_MS;
    if (!force && recentlyUpdated) {
      setLoading(false);
      setRefreshing(false);
      return Promise.resolve();
    }

    if (showSpinner) setLoading(true);

    const task = (async () => {
      const offlineSongs = await getOfflineLibrary();

      try {
        const serverSongs = await apiRequest<ApiLibrarySong[]>('/songs/my-library');
        const merged = await mergeWithOfflineLibrary(serverSongs.map(fromApiLibrarySong), offlineSongs);
        const next = includeOfflineOnlySongs(merged, offlineSongs);
        setSongs(next);
        await writeLibraryCache(next);
        lastRefreshAtRef.current = Date.now();
        setOfflineMode(false);
      } catch {
        setSongs((current) => current.length ? current : sortSongsAlphabetically(offlineSongs));
        setOfflineMode(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    })();

    refreshInFlightRef.current = task;
    task.finally(() => {
      if (refreshInFlightRef.current === task) {
        refreshInFlightRef.current = null;
      }
    });

    return task;
  }, []);

  const hydrateLibrary = useCallback(async () => {
    setLoading(true);
    const [cached, offlineSongs] = await Promise.all([
      readLibraryCache(),
      getOfflineLibrary(),
    ]);

    if (cached?.songs.length) {
      const merged = await mergeWithOfflineLibrary(cached.songs, offlineSongs);
      setSongs(includeOfflineOnlySongs(merged, offlineSongs));
      lastRefreshAtRef.current = cached.savedAt;
    } else {
      setSongs(sortSongsAlphabetically(offlineSongs));
    }

    setLoading(false);
    void loadLibrary(false);
  }, [loadLibrary]);

  useFocusEffect(
    useCallback(() => {
      if (!hydratedRef.current) {
        hydratedRef.current = true;
        void hydrateLibrary();
        return;
      }

      void loadLibrary(false);
    }, [hydrateLibrary, loadLibrary])
  );

  const play = useCallback(async (song: MusicSong) => {
    const index = songs.findIndex((candidate) => identity(candidate) === identity(song));
    try {
      await playSongQueue(songs, index);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [songs]);

  const playAll = useCallback(async () => {
    const playable = netInfo.isConnected === false
      ? songs.filter((song) => song.localUri)
      : songs;
    if (!playable.length) {
      Alert.alert('Nenhuma música disponível', 'Baixe ao menos uma música para tocar offline.');
      return;
    }

    try {
      const index = shuffle ? Math.floor(Math.random() * playable.length) : 0;
      await playSongQueue(playable, index);
    } catch (error) {
      Alert.alert('Não foi possível reproduzir', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [netInfo.isConnected, shuffle, songs]);

  const selectedSongs = useMemo(
    () => songs.filter((song) => selectedIds.has(identity(song))),
    [selectedIds, songs]
  );

  const selectionMode = selectedIds.size > 0;

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setActionsVisible(false);
  }, []);

  const toggleSelection = useCallback((song: MusicSong) => {
    const id = identity(song);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setActionsVisible(false);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(songs.map(identity)));
    setActionsVisible(true);
  }, [songs]);

  const download = useCallback(async (song: MusicSong) => {
    let resolved = song;
    try {
      await notifyDownloadStarted(1);
      resolved = await ensureSourceId(song);
      const key = identity(resolved);
      setDownloadProgress((current) => ({ ...current, [key]: 0 }));
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
          setDownloadProgress((current) => ({
            ...current,
            [key]: progress,
          }));
          void notifyDownloadProgress({
            done: 0,
            total: 1,
            currentTitle: resolved.title,
            percent: progress,
          });
        }
      });
      await notifyDownloadProgress({
        done: 1,
        total: 1,
        currentTitle: offlineSong.title,
        percent: 1,
        force: true,
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
      await notifyDownloadFinished(1);
    } catch (error) {
      Alert.alert('Erro no download', error instanceof Error ? error.message : 'Tente novamente.');
      await notifyDownloadFinished(1, 1);
    } finally {
      const key = identity(resolved);
      setDownloadProgress((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }, []);

  const downloadMany = useCallback(async (targets: MusicSong[]) => {
    const pending = targets.filter((song) => !song.localUri);
    if (!pending.length) {
      Alert.alert('Tudo pronto', 'As músicas selecionadas já estão disponíveis offline.');
      return;
    }

    const failures: string[] = [];
    setBulkDownload({ done: 0, total: pending.length });

    const nativeTargets: MusicSong[] = [];
    for (const song of pending) {
      try {
        nativeTargets.push(await ensureSourceId(song));
      } catch {
        failures.push(song.title);
      }
    }

    const nativeResult = nativeTargets.length
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

    if (nativeResult) {
      const downloaded = nativeResult.downloaded;
      nativeResult.failures.forEach((failure) => failures.push(failure.title || 'Música'));

      if (downloaded.length) {
        setSongs((current) => current.map((candidate) => {
          const replacement = downloaded.find((song) =>
            identity(song) === identity(candidate) || song.id === candidate.id
          );
          return replacement || candidate;
        }));

        for (const offlineSong of downloaded) {
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
      }

      setBulkDownload(null);
      void loadLibrary(false, true);
      if (failures.length) {
        Alert.alert('Download concluído com pendências', `${failures.length} música${failures.length === 1 ? '' : 's'} não baixaram agora. Tente novamente depois.`);
      } else {
        Alert.alert('Downloads prontos', 'As músicas foram baixadas para este celular.');
      }
      return;
    }

    await notifyDownloadStarted(pending.length);

    for (let index = 0; index < pending.length; index += 1) {
      let resolved = pending[index];
      let key = identity(resolved);
      try {
        resolved = await ensureSourceId(resolved);
        key = identity(resolved);
        setDownloadProgress((current) => ({ ...current, [key]: 0 }));
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
            setDownloadProgress((current) => ({
              ...current,
              [key]: progress,
            }));
            void notifyDownloadProgress({
              done: index,
              total: pending.length,
              currentTitle: resolved.title,
              percent: progress,
            });
          }
        });

        setSongs((current) => current.map((candidate) =>
          identity(candidate) === identity(resolved) || identity(candidate) === identity(pending[index])
            ? offlineSong
            : candidate
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
      } catch {
        failures.push(pending[index].title);
      } finally {
        setDownloadProgress((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        setBulkDownload({ done: index + 1, total: pending.length });
        void notifyDownloadProgress({
          done: index + 1,
          total: pending.length,
          currentTitle: pending[index].title,
          percent: 1,
          force: true,
        });
      }
    }

    setBulkDownload(null);
    await notifyDownloadFinished(pending.length, failures.length);
    void loadLibrary(false, true);

    if (failures.length) {
      Alert.alert('Download concluído com pendências', `${failures.length} música${failures.length === 1 ? '' : 's'} não baixaram agora. Tente novamente depois.`);
    } else {
      Alert.alert('Downloads prontos', 'As músicas foram baixadas para este celular.');
    }
  }, [loadLibrary]);

  const downloadAll = useCallback(async () => {
    const nextPending = songs.filter((song) => !song.localUri);
    if (!nextPending.length) {
      Alert.alert('Tudo pronto', 'Todas as músicas da biblioteca já estão disponíveis offline.');
      return;
    }

    Alert.alert('Baixar biblioteca', `Baixar ${nextPending.length} música${nextPending.length === 1 ? '' : 's'} para ouvir offline?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Baixar',
        onPress: () => {
          void downloadMany(nextPending);
        },
      },
    ]);

  }, [downloadMany, songs]);

  const addToPlaylist = useCallback(async (song: MusicSong) => {
    try {
      if (netInfo.isConnected === false) {
        throw new Error('Conecte-se à internet para alterar suas playlists.');
      }
      const playlists = await apiRequest<ApiPlaylist[]>('/playlists/personal');
      if (!playlists.length) {
        Alert.alert('Nenhuma playlist pessoal', 'Crie uma playlist na aba Playlists e depois adicione músicas nela.');
        return;
      }

      Alert.alert('Adicionar em qual playlist?', song.title, [
        { text: 'Cancelar', style: 'cancel' },
        ...playlists.slice(0, 8).map((playlist) => ({
          text: playlist.name,
          onPress: async () => {
            try {
              await apiRequest<void>(`/playlists/personal/${playlist.id}/songs/${encodeURIComponent(song.id)}`, {
                method: 'POST',
              });
              Alert.alert('Adicionada', `"${song.title}" entrou em "${playlist.name}".`);
            } catch (error) {
              Alert.alert('Não foi possível adicionar', error instanceof Error ? error.message : 'Tente novamente.');
            }
          },
        })),
      ]);
    } catch (error) {
      Alert.alert('Não foi possível carregar playlists', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [netInfo.isConnected]);

  const addManyToPlaylist = useCallback(async (targets: MusicSong[]) => {
    try {
      if (netInfo.isConnected === false) {
        throw new Error('Conecte-se à internet para alterar suas playlists.');
      }
      const playlists = await apiRequest<ApiPlaylist[]>('/playlists/personal');
      if (!playlists.length) {
        Alert.alert('Nenhuma playlist pessoal', 'Crie uma playlist na aba Playlists e depois adicione músicas nela.');
        return;
      }

      Alert.alert('Adicionar em qual playlist?', `${targets.length} música${targets.length === 1 ? '' : 's'} selecionada${targets.length === 1 ? '' : 's'}`, [
        { text: 'Cancelar', style: 'cancel' },
        ...playlists.slice(0, 8).map((playlist) => ({
          text: playlist.name,
          onPress: async () => {
            try {
              await apiRequest<void>(`/playlists/personal/${playlist.id}/songs`, {
                method: 'POST',
                json: true,
                body: JSON.stringify({ songIds: targets.map((song) => Number(song.id)).filter(Number.isFinite) }),
              });
              Alert.alert('Adicionadas', `As músicas entraram em "${playlist.name}".`);
              clearSelection();
            } catch (error) {
              Alert.alert('Não foi possível adicionar', error instanceof Error ? error.message : 'Tente novamente.');
            }
          },
        })),
      ]);
    } catch (error) {
      Alert.alert('Não foi possível carregar playlists', error instanceof Error ? error.message : 'Tente novamente.');
    }
  }, [clearSelection, netInfo.isConnected]);

  const removeOfflineMany = useCallback(async (targets: MusicSong[]) => {
    for (const song of targets) {
      if (song.localUri) await removeOfflineSong(song);
    }
    const ids = new Set(targets.map(identity));
    setSongs((current) => current.map((candidate) =>
      ids.has(identity(candidate))
        ? { ...candidate, localUri: undefined, downloadedAt: undefined, sizeBytes: undefined }
        : candidate
    ));
    clearSelection();
  }, [clearSelection]);

  const removeFromAccountMany = useCallback((targets: MusicSong[]) => {
    Alert.alert('Remover da conta', `Remover ${targets.length} música${targets.length === 1 ? '' : 's'} da sua biblioteca?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            if (netInfo.isConnected === false) {
              throw new Error('Conecte-se à internet para remover músicas da conta.');
            }
            for (const song of targets) {
              await apiRequest<void>(`/songs/remove/${encodeURIComponent(song.id)}`, { method: 'DELETE' });
              await removeOfflineSong(song);
            }
            const ids = new Set(targets.map(identity));
            setSongs((current) => current.filter((candidate) => !ids.has(identity(candidate))));
            clearSelection();
          } catch (error) {
            Alert.alert('Não foi possível remover', error instanceof Error ? error.message : 'Tente novamente.');
          }
        },
      },
    ]);
  }, [clearSelection, netInfo.isConnected]);

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
    setSelectedIds((current) => {
      const next = new Set(current);
      next.add(identity(song));
      return next;
    });
    setActionsVisible(true);
    if (Date.now() >= 0) return;

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
        text: 'Adicionar a playlist',
        onPress: () => { void addToPlaylist(song); },
      },
      {
        text: 'Remover da conta',
        style: 'destructive' as const,
        onPress: () => { void removeFromAccount(song); },
      },
    ];
    Alert.alert(song.title, 'Escolha uma ação para esta música.', buttons);
  }, [addToPlaylist, removeFromAccount]);

  const toggleShuffle = () => {
    const next = !shuffle;
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
            {bulkDownload && (
              <Text style={styles.bulkSummary}>Baixando {bulkDownload.done}/{bulkDownload.total}</Text>
            )}
            {selectionMode && (
              <Text style={styles.selectionSummary}>{selectedIds.size} selecionada{selectedIds.size === 1 ? '' : 's'}</Text>
            )}
          </View>
          <View style={styles.headerActions}>
            {selectionMode && (
              <TouchableOpacity accessibilityLabel="Cancelar seleção" style={styles.headerButton} onPress={clearSelection}>
                <Ionicons name="close" size={20} color="#aaa" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              accessibilityLabel="Baixar biblioteca para offline"
              style={[styles.headerButton, bulkDownload && styles.headerButtonActive]}
              onPress={downloadAll}
              disabled={Boolean(bulkDownload)}
            >
              {bulkDownload ? (
                <ActivityIndicator size="small" color="#1db954" />
              ) : (
                <Ionicons name="cloud-download-outline" size={20} color="#aaa" />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel={shuffle ? 'Reproduzir biblioteca aleatória' : 'Reproduzir biblioteca'}
              style={[styles.headerButton, styles.playAllButton]}
              onPress={() => { void playAll(); }}
              disabled={!songs.length}
            >
              <Ionicons name="play" size={20} color="#121212" />
            </TouchableOpacity>
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
                active={activeMediaMatches(activeItem, item)}
                progress={downloadProgress[identity(item)]}
                onPlay={play}
                onDownload={download}
                onLongPress={showSongActions}
                selected={selectedIds.has(identity(item))}
                selectionMode={selectionMode}
                onToggleSelection={toggleSelection}
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
                  void loadLibrary(false, true);
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

      <Modal visible={actionsVisible && selectionMode} transparent animationType="slide" onRequestClose={clearSelection}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setActionsVisible(false)}>
          <TouchableOpacity style={styles.actionSheet} activeOpacity={1}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>AÇÕES</Text>
                <Text style={styles.sheetTitle}>
                  {selectedIds.size} música{selectedIds.size === 1 ? '' : 's'} selecionada{selectedIds.size === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={clearSelection}>
                <Ionicons name="close" size={20} color="#ddd" />
              </TouchableOpacity>
            </View>

            {selectedSongs[0] && (
              <View style={styles.sheetPreview}>
                {selectedSongs[0].artworkUrl ? (
                  <Image source={{ uri: selectedSongs[0].artworkUrl }} style={styles.sheetCover} />
                ) : (
                  <View style={styles.sheetCoverPlaceholder}>
                    <Ionicons name="musical-note" size={20} color="#1db954" />
                  </View>
                )}
                <View style={styles.sheetPreviewText}>
                  <Text style={styles.sheetSongTitle} numberOfLines={1}>{selectedSongs[0].title}</Text>
                  <Text style={styles.sheetSongArtist} numberOfLines={1}>
                    {selectedIds.size === 1 ? selectedSongs[0].artist : `e mais ${selectedIds.size - 1}`}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.sheetGrid}>
              <TouchableOpacity style={styles.sheetAction} onPress={selectAll}>
                <Ionicons name="checkbox-outline" size={21} color="#1db954" />
                <Text style={styles.sheetActionText}>Selecionar tudo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={() => { setActionsVisible(false); void downloadMany(selectedSongs); }}>
                <Ionicons name="cloud-download-outline" size={21} color="#1db954" />
                <Text style={styles.sheetActionText}>Baixar offline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={() => { setActionsVisible(false); void addManyToPlaylist(selectedSongs); }}>
                <Ionicons name="add-circle-outline" size={21} color="#1db954" />
                <Text style={styles.sheetActionText}>Adicionar à playlist</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetAction} onPress={() => { setActionsVisible(false); void removeOfflineMany(selectedSongs); }}>
                <Ionicons name="trash-outline" size={21} color="#ff9f9f" />
                <Text style={styles.sheetActionDanger}>Apagar downloads</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetAction, styles.sheetActionWide]} onPress={() => { setActionsVisible(false); removeFromAccountMany(selectedSongs); }}>
                <Ionicons name="remove-circle-outline" size={21} color="#ff6b6b" />
                <Text style={styles.sheetActionDanger}>Remover da conta</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  bulkSummary: { color: '#aaa', fontSize: 11, marginTop: 3 },
  selectionSummary: { color: '#f4d06f', fontSize: 11, marginTop: 3, fontWeight: '700' },
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
  playAllButton: { backgroundColor: '#1db954', borderColor: '#1db954' },
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
  selectionDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#555',
    backgroundColor: '#151515',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  selectionDotActive: { backgroundColor: '#1db954', borderColor: '#1db954' },
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: '#00000099',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3b3b3b',
    marginBottom: 15,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sheetEyebrow: { color: '#1db954', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sheetTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 2 },
  sheetClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#262626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101010',
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#282828',
    padding: 10,
    marginBottom: 14,
  },
  sheetCover: { width: 48, height: 48, borderRadius: 10, marginRight: 10 },
  sheetCoverPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    marginRight: 10,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetPreviewText: { flex: 1 },
  sheetSongTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sheetSongArtist: { color: '#888', fontSize: 12, marginTop: 3 },
  sheetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sheetAction: {
    flexBasis: '48%',
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 15,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#303030',
    paddingHorizontal: 12,
  },
  sheetActionWide: { flexBasis: '100%' },
  sheetActionText: { color: '#eee', fontSize: 13, fontWeight: '800', flex: 1 },
  sheetActionDanger: { color: '#ffb1b1', fontSize: 13, fontWeight: '800', flex: 1 },
});
