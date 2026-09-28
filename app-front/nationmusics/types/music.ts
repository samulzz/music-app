export type MusicSong = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  artworkUrl?: string;
  sourceId?: string;
  localUri?: string;
  remoteUrl?: string;
  downloadedAt?: number;
  sizeBytes?: number;
  genres?: string[];
  queueOrigin?: 'playlist' | 'recommendation' | 'manual';
};

export type ApiLibrarySong = {
  id: number | string;
  title: string;
  artist: string;
  album?: string;
  albumArtist?: string;
  coverUrl?: string;
  sourceId?: string;
  uri?: string;
  genres?: string[];
};

export type ApiSearchSong = {
  id: number | string;
  sourceId?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  coverUrl?: string;
  uri?: string;
  titulo?: string;
  artista?: string;
  capa?: string;
  genres?: string[];
};

export type ApiPlaylist = {
  id: number;
  name: string;
  description?: string;
  iconUrl?: string;
  globalPlaylist?: boolean;
  songs?: ApiLibrarySong[];
};

export type SpotifyImportTrack = {
  spotifyId: string;
  title: string;
  artist: string;
  durationMs: number;
};

export type SpotifyPlaylistPreview = {
  spotifyId: string;
  type: 'playlist' | 'album' | 'track';
  name: string;
  coverUrl?: string;
  totalTracks: number;
  truncated: boolean;
  tracks: SpotifyImportTrack[];
};

export function fromApiLibrarySong(song: ApiLibrarySong): MusicSong {
  return {
    id: String(song.id),
    title: song.title,
    artist: song.artist,
    album: song.album,
    albumArtist: song.albumArtist,
    artworkUrl: song.coverUrl,
    sourceId: song.sourceId,
    genres: song.genres,
  };
}

export function fromApiSearchSong(song: ApiSearchSong): MusicSong {
  const sourceId = String(song.sourceId || song.id || '');
  return {
    id: String(song.id || sourceId),
    sourceId,
    title: song.title || song.titulo || 'Musica',
    artist: song.artist || song.artista || 'Artista desconhecido',
    album: song.album,
    albumArtist: song.albumArtist,
    artworkUrl: song.coverUrl || song.capa,
    genres: song.genres,
  };
}

export type AlbumSummary = {
  name: string;
  artist: string;
  coverUrl?: string;
  songCount: number;
  playlistId?: number;
};

export type SmartSearchResponse = {
  correctedQuery?: string;
  songs: ApiSearchSong[];
  artists: Array<{ name: string; artworkUrl?: string; songCount: number }>;
  albums: AlbumSummary[];
  playlists: ApiPlaylist[];
};
