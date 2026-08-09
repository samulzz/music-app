import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, type DownloadProgress } from 'expo-file-system';
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

import type { MusicSong } from '../types/music';
import { apiRequest, getMediaHeaders } from './api';
import { musicDownloadUrl } from './config';

const INDEX_KEY = 'nationmusics.offline-library.v2';
const MUSIC_DIRECTORY_NAME = 'nationmusics-audio';
const DOWNLOAD_ATTEMPTS = 3;
const PREPARATION_POLL_MS = 2000;
const PREPARATION_TIMEOUT_MS = 8 * 60 * 1000;
const MIN_OFFLINE_AUDIO_BYTES = 512 * 1024;

type NativeOfflineDownloadsModule = {
  downloadSongs: (
    songs: Array<Record<string, string>>,
    headers: Record<string, string>,
    taskId: string
  ) => Promise<string>;
};

type NativeDownloadFailure = {
  id?: string;
  sourceId?: string;
  title?: string;
  message?: string;
};

type NativeDownloadResult = {
  downloaded: MusicSong[];
  failures: NativeDownloadFailure[];
};

export type NativeDownloadProgressEvent = {
  taskId: string;
  type: 'progress' | 'song-complete' | 'song-failed' | 'complete' | 'error';
  id?: string;
  sourceId?: string;
  title?: string;
  done?: number;
  total?: number;
  currentPercent?: number;
  indeterminate?: boolean;
  song?: MusicSong;
  failure?: NativeDownloadFailure;
  failures?: number;
  message?: string;
};

type OfflineLibraryOptions = {
  validateFiles?: boolean;
};

const nativeOfflineDownloads = NativeModules.NationOfflineDownloads as
  | NativeOfflineDownloadsModule
  | undefined;
const NATIVE_DOWNLOAD_PROGRESS_EVENT = 'NationOfflineDownloadProgress';

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|SocketTimeoutException/i.test(message);
}

type PreparationResponse = {
  status: 'not_started' | 'preparing' | 'ready' | 'error';
  message?: string;
};

async function waitUntilPrepared(song: Pick<MusicSong, 'sourceId' | 'title' | 'artist'>) {
  const sourceId = song.sourceId?.trim();
  if (!sourceId) {
    throw new Error('Esta música não possui uma origem válida para download.');
  }
  const metadata = `?titulo=${encodeURIComponent(song.title)}&artista=${encodeURIComponent(song.artist)}`;

  await apiRequest<PreparationResponse>(`/musicas/preparar/${encodeURIComponent(sourceId)}${metadata}`, {
    method: 'POST',
    authenticated: false,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < PREPARATION_TIMEOUT_MS) {
    await wait(PREPARATION_POLL_MS);
    const result = await apiRequest<PreparationResponse>(
      `/musicas/preparar/${encodeURIComponent(sourceId)}/status`,
      { authenticated: false }
    );
    if (result.status === 'ready') return;
    if (result.status === 'error') {
      throw new Error(result.message || 'Não foi possível preparar esta música.');
    }
  }
  throw new Error('A preparação demorou demais. Tente novamente mais tarde.');
}

function getMusicDirectory() {
  const directory = new Directory(Paths.document, MUSIC_DIRECTORY_NAME);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function normalizeFilePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function songIdentity(song: Pick<MusicSong, 'id' | 'sourceId'>) {
  return song.sourceId?.trim() || song.id;
}

function fileForSong(song: Pick<MusicSong, 'id' | 'sourceId' | 'title'>) {
  const identity = normalizeFilePart(songIdentity(song)) || normalizeFilePart(song.title) || 'track';
  return new File(getMusicDirectory(), `${identity}.mp3`);
}

function nativePayloadForSong(song: MusicSong) {
  const sourceId = song.sourceId?.trim();
  if (!sourceId) {
    throw new Error('Esta música não possui uma origem válida para download.');
  }

  const fileName = normalizeFilePart(songIdentity(song)) || normalizeFilePart(song.title) || 'track';
  return {
    id: song.id,
    sourceId,
    title: song.title,
    artist: song.artist,
    artworkUrl: song.artworkUrl || '',
    fileName,
    url: musicDownloadUrl(sourceId, song.title, song.artist),
  };
}

function nativeTaskId() {
  return `download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeNativeDownloadedSong(item: MusicSong & { localUri: string; downloadedAt?: number; sizeBytes?: number }): MusicSong {
  return {
    id: String(item.id || item.sourceId),
    sourceId: item.sourceId,
    title: item.title,
    artist: item.artist,
    artworkUrl: item.artworkUrl,
    localUri: item.localUri,
    downloadedAt: item.downloadedAt || Date.now(),
    sizeBytes: item.sizeBytes,
  };
}

function legacyFileForSong(song: Pick<MusicSong, 'title'>) {
  const cleanTitle = song.title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return new File(Paths.document, `${cleanTitle}.mp3`);
}

function fileFromUri(uri?: string) {
  if (!uri) return null;
  try {
    return new File(uri);
  } catch {
    return null;
  }
}

function isUsableAudioFile(file: File | null | undefined) {
  try {
    return Boolean(file?.exists && file.size >= MIN_OFFLINE_AUDIO_BYTES);
  } catch {
    return false;
  }
}

function offlineFileCandidates(song: Pick<MusicSong, 'id' | 'sourceId' | 'title' | 'localUri'>) {
  const candidates = [
    fileFromUri(song.localUri),
    fileForSong(song),
    legacyFileForSong(song),
  ].filter((file): file is File => Boolean(file));

  const seen = new Set<string>();
  return candidates.filter((file) => {
    const key = file.uri;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveOfflineFile(song: Pick<MusicSong, 'id' | 'sourceId' | 'title' | 'localUri'>) {
  return offlineFileCandidates(song).find(isUsableAudioFile) || null;
}

function withResolvedOfflineFile(song: MusicSong): MusicSong | null {
  const file = resolveOfflineFile(song);
  if (!file) return null;

  return {
    ...song,
    localUri: file.uri,
    downloadedAt: song.downloadedAt || file.lastModified || Date.now(),
    sizeBytes: file.size,
  };
}

function requireUsableOfflineSong(song: MusicSong) {
  const resolved = withResolvedOfflineFile(song);
  if (!resolved) {
    throw new Error('O arquivo baixado ficou incompleto. Tente baixar esta musica novamente.');
  }
  return resolved;
}

async function readIndex(): Promise<MusicSong[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as MusicSong[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(songs: MusicSong[]) {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(songs));
  try {
    const { refreshAndroidAutoLibrary } = await import('./player');
    await refreshAndroidAutoLibrary();
  } catch {}
}

export async function getOfflineLibrary(options: OfflineLibraryOptions = {}) {
  const stored = await readIndex();
  const validateFiles = options.validateFiles ?? true;

  if (!validateFiles) {
    return stored.filter((song) => Boolean(song.localUri));
  }

  const valid = stored
    .map((song) => withResolvedOfflineFile(song))
    .filter((song): song is MusicSong => Boolean(song));

  const changed = valid.length !== stored.length
    || valid.some((song, index) =>
      song.localUri !== stored[index]?.localUri
      || song.sizeBytes !== stored[index]?.sizeBytes
      || song.downloadedAt !== stored[index]?.downloadedAt
    );

  if (changed) {
    await writeIndex(valid);
  }
  return valid;
}

export async function findOfflineSong(song: MusicSong) {
  const library = await getOfflineLibrary();
  const identity = songIdentity(song);
  const indexed = library.find((candidate) => songIdentity(candidate) === identity);
  if (indexed) {
    const refreshed: MusicSong = {
      ...indexed,
      title: song.title || indexed.title,
      artist: song.artist || indexed.artist,
      artworkUrl: song.artworkUrl || indexed.artworkUrl,
    };
    if (refreshed.artworkUrl !== indexed.artworkUrl) {
      await upsertOfflineSong(refreshed);
    }
    return refreshed;
  }

  const existingFile = resolveOfflineFile(song);
  if (!existingFile) return null;

  const imported: MusicSong = {
    ...song,
    localUri: existingFile.uri,
    downloadedAt: existingFile.lastModified || Date.now(),
    sizeBytes: existingFile.size,
  };
  await upsertOfflineSong(imported);
  return imported;
}

export async function upsertOfflineSong(song: MusicSong) {
  if (!song.localUri) return;
  const library = await readIndex();
  const identity = songIdentity(song);
  const next = [
    song,
    ...library.filter((candidate) => songIdentity(candidate) !== identity),
  ];
  await writeIndex(next);
}

export function canUseNativeBackgroundDownloads() {
  return Platform.OS === 'android' && Boolean(nativeOfflineDownloads?.downloadSongs);
}

async function requestAndroidNotificationPermission() {
  if (Platform.OS !== 'android') return;
  try {
    const Notifications = await import('expo-notifications');
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // O download nativo continua funcionando; apenas a notificação pode ficar oculta se o sistema negar.
  }
}

export async function downloadSongsWithNativeService(
  songs: MusicSong[],
  onEvent?: (event: NativeDownloadProgressEvent) => void
): Promise<NativeDownloadResult | null> {
  if (!canUseNativeBackgroundDownloads() || !nativeOfflineDownloads) return null;

  await requestAndroidNotificationPermission();
  const headers = await getMediaHeaders();
  const payload = songs.map(nativePayloadForSong);
  const taskId = nativeTaskId();
  const subscription = onEvent
    ? DeviceEventEmitter.addListener(NATIVE_DOWNLOAD_PROGRESS_EVENT, (rawEvent) => {
        try {
          const parsed = JSON.parse(String(rawEvent || '{}')) as NativeDownloadProgressEvent;
          if (parsed.taskId !== taskId) return;
          if (parsed.song?.localUri) {
            parsed.song = normalizeNativeDownloadedSong(parsed.song as MusicSong & { localUri: string });
          }
          onEvent(parsed);
        } catch {}
      })
    : null;

  let rawResult = '{}';
  try {
    rawResult = await nativeOfflineDownloads.downloadSongs(payload, headers, taskId);
  } finally {
    subscription?.remove();
  }
  const parsed = JSON.parse(rawResult || '{}') as {
    downloaded?: Array<MusicSong & { localUri: string; downloadedAt?: number; sizeBytes?: number }>;
    failures?: NativeDownloadFailure[];
  };

  const failures = [...(parsed.failures || [])];
  const downloaded = (parsed.downloaded || []).reduce<MusicSong[]>((result, item) => {
    const normalized = normalizeNativeDownloadedSong(item);
    const verified = withResolvedOfflineFile(normalized);
    if (verified) {
      result.push(verified);
    } else {
      failures.push({
        id: normalized.id,
        sourceId: normalized.sourceId,
        title: normalized.title,
        message: 'Arquivo offline incompleto.',
      });
    }
    return result;
  }, []);

  for (const song of downloaded) {
    await upsertOfflineSong(song);
  }

  return {
    downloaded,
    failures,
  };
}

export async function downloadSong(
  song: MusicSong,
  onProgress?: (progress: DownloadProgress) => void
) {
  const sourceId = song.sourceId?.trim();
  if (!sourceId) {
    throw new Error('Esta música não possui uma origem válida para download.');
  }

  const existing = await findOfflineSong(song);
  if (existing) return existing;

  const nativeResult = await downloadSongsWithNativeService([{ ...song, sourceId }]);
  if (nativeResult) {
    const downloaded = nativeResult.downloaded[0];
    if (downloaded) return downloaded;

    const failure = nativeResult.failures[0];
    throw new Error(failure?.message || 'O download não foi concluído.');
  }

  const headers = await getMediaHeaders();
  const destination = fileForSong(song);
  const partial = new File(destination.parentDirectory, `${destination.name}.part`);

  if (partial.exists) partial.delete();

  try {
    await waitUntilPrepared({ ...song, sourceId });

    let downloaded: File | null = null;
    let lastError: unknown;

    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
      try {
        if (partial.exists) partial.delete();
        downloaded = await File.downloadFileAsync(
          musicDownloadUrl(sourceId, song.title, song.artist),
          partial,
          {
            headers,
            idempotent: true,
            onProgress,
          }
        );
        break;
      } catch (error) {
        lastError = error;
        if (partial.exists) partial.delete();
        if (!isTimeoutError(error) || attempt === DOWNLOAD_ATTEMPTS) {
          throw error;
        }

        // A primeira requisição pode expirar enquanto o servidor termina a
        // conversão. As próximas usam o arquivo já armazenado no cache.
        await wait(attempt * 4000);
      }
    }

    if (!downloaded) {
      throw lastError || new Error('O download não foi concluído.');
    }

    if (destination.exists) destination.delete();
    await downloaded.move(destination);

    const offlineSong = requireUsableOfflineSong({
      ...song,
      sourceId,
      localUri: destination.uri,
      downloadedAt: Date.now(),
      sizeBytes: destination.size,
    });
    await upsertOfflineSong(offlineSong);
    return offlineSong;
  } catch (error) {
    if (partial.exists) partial.delete();
    if (isTimeoutError(error)) {
      throw new Error('A música demorou para ser preparada. Tente novamente em alguns segundos.');
    }
    throw error;
  }
}

export async function removeOfflineSong(song: MusicSong) {
  if (song.localUri) {
    const file = new File(song.localUri);
    if (file.exists) file.delete();
  }

  const identity = songIdentity(song);
  const library = await readIndex();
  await writeIndex(library.filter((candidate) => songIdentity(candidate) !== identity));
}

function offlineLookupKeys(song: Pick<MusicSong, 'id' | 'sourceId'>) {
  return [
    songIdentity(song),
    song.id,
    song.sourceId?.trim(),
  ].filter((key): key is string => Boolean(key));
}

export async function mergeWithOfflineLibrary(songs: MusicSong[], offlineSongs?: MusicSong[]) {
  const library = offlineSongs ?? await getOfflineLibrary();
  const offlineByKey = new Map<string, MusicSong>();

  for (const offline of library) {
    for (const key of offlineLookupKeys(offline)) {
      offlineByKey.set(key, offline);
    }
  }

  return songs.map((song) => {
    const offline = offlineLookupKeys(song)
      .map((key) => offlineByKey.get(key))
      .find(Boolean);

    if (!offline) return song;

    return {
      ...song,
      ...offline,
      id: song.id || offline.id,
      sourceId: song.sourceId || offline.sourceId,
      title: song.title || offline.title,
      artist: song.artist || offline.artist,
      artworkUrl: song.artworkUrl || offline.artworkUrl,
    };
  });
}

export function formatBytes(bytes?: number) {
  if (!bytes || bytes < 1) return '';
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}
