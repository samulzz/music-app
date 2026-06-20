import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths, type DownloadProgress } from 'expo-file-system';

import type { MusicSong } from '../types/music';
import { getAuthenticatedHeaders } from './api';
import { musicDownloadUrl } from './config';

const INDEX_KEY = 'nationmusics.offline-library.v2';
const MUSIC_DIRECTORY_NAME = 'nationmusics-audio';

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

function legacyFileForSong(song: Pick<MusicSong, 'title'>) {
  const cleanTitle = song.title.replace(/[^a-zA-Z0-9 ]/g, '').trim();
  return new File(Paths.document, `${cleanTitle}.mp3`);
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
}

export async function getOfflineLibrary() {
  const stored = await readIndex();
  const valid = stored.filter((song) => {
    if (!song.localUri) return false;
    return new File(song.localUri).exists;
  });

  if (valid.length !== stored.length) {
    await writeIndex(valid);
  }
  return valid;
}

export async function findOfflineSong(song: MusicSong) {
  const library = await getOfflineLibrary();
  const identity = songIdentity(song);
  const indexed = library.find((candidate) => songIdentity(candidate) === identity);
  if (indexed) return indexed;

  const currentFile = fileForSong(song);
  const legacyFile = legacyFileForSong(song);
  const existingFile = currentFile.exists ? currentFile : legacyFile.exists ? legacyFile : null;
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

  const headers = await getAuthenticatedHeaders();
  const destination = fileForSong(song);
  const partial = new File(destination.parentDirectory, `${destination.name}.part`);

  if (partial.exists) partial.delete();

  try {
    const downloaded = await File.downloadFileAsync(
      musicDownloadUrl(sourceId, song.title),
      partial,
      {
        headers,
        idempotent: true,
        onProgress,
      }
    );

    if (destination.exists) destination.delete();
    await downloaded.move(destination);

    const offlineSong: MusicSong = {
      ...song,
      sourceId,
      localUri: destination.uri,
      downloadedAt: Date.now(),
      sizeBytes: destination.size,
    };
    await upsertOfflineSong(offlineSong);
    return offlineSong;
  } catch (error) {
    if (partial.exists) partial.delete();
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

export async function mergeWithOfflineLibrary(songs: MusicSong[]) {
  return Promise.all(
    songs.map(async (song) => {
      const offline = await findOfflineSong(song);
      return offline ? { ...song, ...offline } : song;
    })
  );
}

export function formatBytes(bytes?: number) {
  if (!bytes || bytes < 1) return '';
  const megabytes = bytes / 1024 / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}
