import type { MusicSong } from '../types/music';

const key = (value?: string) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Version labels (live/remix/acoustic) deliberately remain part of the identity.
export function songContentKey(song: Pick<MusicSong, 'title' | 'artist'>) {
  return song.title?.trim() && song.artist?.trim() ? `content:${key(song.title)}|${key(song.artist)}` : '';
}
export function uniqueSongs(songs: MusicSong[]) {
  const result = new Map<string, MusicSong>();
  for (const song of songs) {
    const id = songContentKey(song) || `source:${song.sourceId || song.id}`;
    const previous = result.get(id);
    if (!previous || (!previous.localUri && song.localUri)) result.set(id, song);
  }
  return [...result.values()];
}
