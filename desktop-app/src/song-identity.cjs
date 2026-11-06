const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function contentIdentity(song) {
  return song?.title?.trim() && song?.artist?.trim()
    ? `content:${normalize(song.title)}|${normalize(song.artist)}` : `source:${song?.sourceId || song?.id || ''}`;
}
module.exports = { contentIdentity };
