import type { MusicSong } from '../types/music';

function compareText(left?: string, right?: string) {
  return (left || '').localeCompare(right || '', 'pt-BR', {
    sensitivity: 'base',
    numeric: true,
  });
}

export function sortSongsAlphabetically(songs: MusicSong[]) {
  return [...songs].sort((left, right) =>
    compareText(left.title, right.title)
    || compareText(left.artist, right.artist)
    || compareText(left.sourceId || left.id, right.sourceId || right.id)
  );
}
