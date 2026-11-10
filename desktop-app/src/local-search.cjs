const key = (text = '') => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function searchOfflineSongs(songs, query) {
  const q=key(query),tokens=q.split(/\s+/).filter(Boolean),seen=new Set();
  return songs.filter(song=>song.downloaded||song.localUri).map(song=>{
    const title=key(song.title),artist=key(song.artist),album=key(song.album);
    const combined=[title,artist,album,...(song.genres||[]).map(key)].join(' ');
    const identity=title+'|'+artist;
    const matches=tokens.every(token=>combined.includes(token))&&!seen.has(identity);
    if(matches)seen.add(identity);
    const score=title===q?500:title.startsWith(q)?400:title.includes(q)?300:artist.includes(q)?200:100;
    return {song,score,matches};
  }).filter(row=>row.matches).sort((a,b)=>b.score-a.score||a.song.title.localeCompare(b.song.title,'pt-BR')).map(row=>row.song);
}
module.exports={searchOfflineSongs};
