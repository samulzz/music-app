import LegacyStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

// Reconstructible metadata lives outside AsyncStorage's limited Android SQLite.
// Never touch login, download indexes, audio files, listening events or settings.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_FILES = 96;
const MAX_MEMORY_BYTES = 4 * 1024 * 1024;
const memory = new Map<string, string>();
const revisions = new Map<string, number>();
let memoryBytes = 0;
let writes: Promise<unknown> = Promise.resolve();
let maintenance: Promise<void> | null = null;

export function isDisposableMetadataKey(key: string) {
  return ['nationmusics.api-cache.', 'nationmusics.home-playlists.', 'nationmusics.personal-playlists.',
    'nationmusics.playlist.', 'nationmusics.library-cache.'].some(prefix => key.startsWith(prefix));
}
function isSearchCache(key: string) {
  return /^nationmusics\.api-cache\.\/(?:catalog\/search|songs\/search)(?:\?|\/)/.test(key);
}
function remember(key: string, value: string) {
  const previous = memory.get(key);
  if (previous !== undefined) { memoryBytes -= previous.length * 2; memory.delete(key); }
  if (value.length * 2 > MAX_MEMORY_BYTES) return;
  memory.set(key, value); memoryBytes += value.length * 2;
  while (memoryBytes > MAX_MEMORY_BYTES || memory.size > 64) {
    const oldest = memory.keys().next().value!;
    memoryBytes -= memory.get(oldest)!.length * 2; memory.delete(oldest);
  }
}
function directory() {
  const dir = new Directory(Paths.document, 'nationmusics-metadata-cache-v1');
  dir.create({ idempotent: true, intermediates: true });
  return dir;
}
function filename(key: string) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < key.length; i++) { a = Math.imul(a ^ key.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ key.charCodeAt(i); }
  return `c-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}.json`;
}
function trim() {
  const files = directory().list().filter((file): file is File => file instanceof File && /^c-[a-f0-9]+\.json$/.test(file.name));
  let bytes = files.reduce((sum, file) => sum + file.size, 0), count = files.length;
  files.sort((a, b) => (a.modificationTime || 0) - (b.modificationTime || 0));
  for (const file of files) {
    if (bytes <= MAX_TOTAL_BYTES && count <= MAX_FILES) break;
    bytes -= file.size; count--; file.delete();
  }
}
function enqueue(work: () => Promise<unknown>) {
  writes = writes.catch(() => {}).then(work).catch(() => {});
  return writes;
}
async function persist(key: string, value: string, revision: number) {
  if (revisions.get(key) !== revision || value.length * 2 > MAX_FILE_BYTES) return false;
  const file = new File(directory(), filename(key));
  file.write(JSON.stringify({ key, value }));
  trim();
  return true;
}
function compact(key: string, raw: string) {
  // List screens need names/covers/counts, not copies of every song in each list.
  const personal = key.startsWith('nationmusics.personal-playlists.');
  const apiList = /^nationmusics\.api-cache\.\/playlists\/(global|personal)\.account\./.test(key);
  if (!personal && !apiList) return raw;
  try {
    const value = JSON.parse(raw);
    const summaries = (rows: any[]) => rows.map(({ songs, ...playlist }: any) => ({ ...playlist, songCount: playlist.songCount ?? songs?.length ?? 0 }));
    if (personal && Array.isArray(value.playlists)) value.playlists = summaries(value.playlists);
    if (apiList && Array.isArray(value.data)) value.data = summaries(value.data);
    return JSON.stringify(value);
  } catch { return raw; }
}

export const metadataCache = {
  async getItem(key: string): Promise<string | null> {
    if (!isDisposableMetadataKey(key)) return null;
    const known = memory.get(key);
    if (known !== undefined) return known;
    try {
      const file = new File(directory(), filename(key));
      if (file.exists) {
        const stored = JSON.parse(await file.text());
        // Verify the complete key as well as the hash: accounts cannot share rows.
        if (stored.key === key && typeof stored.value === 'string') { remember(key, stored.value); return stored.value; }
      }
    } catch {}
    try {
      const revision = revisions.get(key) || 0;
      const legacy = await LegacyStorage.getItem(key);
      if (revisions.get(key) !== undefined && revisions.get(key) !== revision) return memory.get(key) || null;
      if (legacy !== null) {
        const value = compact(key, legacy); remember(key, value);
        if (!revisions.has(key)) revisions.set(key, 0);
        void enqueue(async () => { if (await persist(key, value, revision)) await LegacyStorage.removeItem(key); });
        return value;
      }
    } catch {}
    return null;
  },
  async setItem(key: string, raw: string): Promise<void> {
    if (!isDisposableMetadataKey(key)) return;
    const value = compact(key, raw), revision = (revisions.get(key) || 0) + 1;
    revisions.set(key, revision); remember(key, value);
    // Persistence failure must never turn a successfully loaded library into an error.
    void enqueue(async () => { if (await persist(key, value, revision)) await LegacyStorage.removeItem(key); });
  },
};

export function maintainMetadataCache(): Promise<void> {
  if (maintenance) return maintenance;
  maintenance = (async () => {
    try {
      const keys = (await LegacyStorage.getAllKeys()).filter(isDisposableMetadataKey);
      const queries = keys.filter(isSearchCache);
      for (let i = 0; i < queries.length; i += 16) {
        await LegacyStorage.multiRemove(queries.slice(i, i + 16));
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      for (const key of keys.filter(key => !isSearchCache(key))) {
        await metadataCache.getItem(key);
        await writes;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      trim();
    } catch { /* Keep memory/local playback usable even if the phone disk is full. */ }
  })();
  return maintenance;
}
