export type MusicSong = {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  sourceId?: string;
  localUri?: string;
  remoteUrl?: string;
  downloadedAt?: number;
  sizeBytes?: number;
};

export type ApiLibrarySong = {
  id: number | string;
  title: string;
  artist: string;
  coverUrl?: string;
  sourceId?: string;
  uri?: string;
};

export type ApiSearchSong = {
  id: string;
  titulo: string;
  artista: string;
  capa?: string;
};

export type ApiPlaylist = {
  id: number;
  name: string;
  description?: string;
  iconUrl?: string;
};

export type SpotifyImportTrack = {
  spotifyId: string;
  title: string;
  artist: string;
  durationMs: number;
};

export type SpotifyPlaylistPreview = {
  spotifyId: string;
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
    artworkUrl: song.coverUrl,
    sourceId: song.sourceId,
  };
}

export function fromApiSearchSong(song: ApiSearchSong): MusicSong {
  return {
    id: song.id,
    sourceId: song.id,
    title: song.titulo,
    artist: song.artista,
    artworkUrl: song.capa,
  };
}
