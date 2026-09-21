import type { MusicSong } from '../types/music';

export type ArtistResult = { name: string; artworkUrl?: string; songCount: number };

export function artistsFromSongs(songs: MusicSong[], query: string): ArtistResult[] {
  const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!normalizedQuery) return [];
  const artists = new Map<string, ArtistResult>();
  songs.forEach((song) => {
    String(song.artist || '').split(/\s*(?:,|\bfeat\.?\b|\bft\.?\b|\s+&\s+)\s*/i).forEach((rawName) => {
      const name = rawName.trim();
      const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      if (!name || !key.includes(normalizedQuery) || key === 'artista desconhecido') return;
      const previous = artists.get(key);
      if (previous) previous.songCount += 1;
      else artists.set(key, { name, artworkUrl: song.artworkUrl, songCount: 1 });
    });
  });
  return [...artists.values()].sort((a, b) => b.songCount - a.songCount || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 12);
}
