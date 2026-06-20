import type { ApiSearchSong, MusicSong } from '../types/music';
import { apiRequest } from './api';

export async function ensureSourceId(song: MusicSong) {
  if (song.sourceId?.trim()) return song;

  const query = `${song.title} ${song.artist}`.trim();
  const results = await apiRequest<ApiSearchSong[]>(
    `/musicas/buscar?q=${encodeURIComponent(query)}`
  );
  const sourceId = results[0]?.id;
  if (!sourceId) {
    throw new Error('Não foi possível localizar a origem desta música.');
  }
  return { ...song, sourceId };
}
