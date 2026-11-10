import type { MusicSong } from '../types/music';
import { uniqueSongs } from './song-identity';

const key = (text: string = '') => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function searchOfflineSongs(songs: MusicSong[], query: string, genre = '') {
  const q = key(query), requiredGenre = key(genre), tokens = q.split(/\s+/).filter(Boolean);
  return uniqueSongs(songs.filter(song => Boolean(song.localUri))).map(song => {
    const title = key(song.title), artist = key(song.artist), album = key(song.album), genres = (song.genres || []).map(key);
    const combined = [title, artist, album, ...genres].join(' ');
    const matches = requiredGenre ? genres.includes(requiredGenre) : tokens.every(token => combined.includes(token));
    const score = title === q ? 500 : title.startsWith(q) ? 400 : title.includes(q) ? 300 : artist.includes(q) ? 200 : 100;
    return { song, score, matches };
  }).filter(row => row.matches).sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, 'pt-BR')).map(row => row.song);
}
