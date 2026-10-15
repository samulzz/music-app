import type { MusicSong } from '../types/music';
export type PlaylistSnapshot = { savedAt: number; songs: MusicSong[] };
const snapshots = new Map<string, PlaylistSnapshot>();
export function readPlaylistSnapshot(key: string, daily = false): PlaylistSnapshot | undefined {
  const value = key ? snapshots.get(key) : undefined;
  if (daily && value && new Date(value.savedAt).toDateString() !== new Date().toDateString()) return undefined;
  return value;
}
export function rememberPlaylistSnapshot(key: string, value: PlaylistSnapshot) {
  if (!key) return;
  snapshots.delete(key); snapshots.set(key, value);
  while (snapshots.size > 24) snapshots.delete(snapshots.keys().next().value!);
}
