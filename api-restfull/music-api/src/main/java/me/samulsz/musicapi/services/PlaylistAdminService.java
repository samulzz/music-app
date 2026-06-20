package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.PlaylistRequest;
import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Playlist;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.repositories.PlaylistRepository;
import me.samulsz.musicapi.repositories.SongRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Service
public class PlaylistAdminService {

    private final PlaylistRepository playlistRepository;
    private final SongRepository songRepository;

    public PlaylistAdminService(PlaylistRepository playlistRepository, SongRepository songRepository) {
        this.playlistRepository = playlistRepository;
        this.songRepository = songRepository;
    }

    public Playlist createPlaylist(PlaylistRequest request) {
        if (request.getName() == null || request.getName().trim().isEmpty()) {
            throw new RuntimeException("Nome da playlist é obrigatório.");
        }

        Playlist playlist = new Playlist();
        applyPlaylistPayload(playlist, request);
        return playlistRepository.save(playlist);
    }

    public Playlist updatePlaylist(Long playlistId, PlaylistRequest request) {
        Playlist playlist = playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("Playlist não encontrada."));

        applyPlaylistPayload(playlist, request);
        return playlistRepository.save(playlist);
    }

    public void deletePlaylist(Long playlistId) {
        if (!playlistRepository.existsById(playlistId)) {
            throw new RuntimeException("Playlist não encontrada.");
        }
        playlistRepository.deleteById(playlistId);
    }

    public List<Playlist> listAllPlaylists() {
        return playlistRepository.findAll();
    }

    public Playlist getPlaylist(Long playlistId) {
        return playlistRepository.findById(playlistId)
                .orElseThrow(() -> new RuntimeException("Playlist não encontrada."));
    }

    public Playlist addSongsToPlaylist(Long playlistId, List<Long> songIds) {
        Playlist playlist = getPlaylist(playlistId);
        if (songIds == null || songIds.isEmpty()) {
            return playlist;
        }

        Set<Song> merged = new LinkedHashSet<>(playlist.getSongs());
        for (Long songId : songIds) {
            Song song = songRepository.findById(songId)
                    .orElseThrow(() -> new RuntimeException("Música não encontrada: " + songId));
            merged.add(song);
        }

        playlist.setSongs(merged);
        return playlistRepository.save(playlist);
    }

    public Playlist removeSongFromPlaylist(Long playlistId, Long songId) {
        Playlist playlist = getPlaylist(playlistId);
        Set<Song> filtered = new LinkedHashSet<>(playlist.getSongs());
        filtered.removeIf(song -> song.getId().equals(songId));
        playlist.setSongs(filtered);
        return playlistRepository.save(playlist);
    }

    public List<Song> searchSongs(String query) {
        String safeQuery = query == null ? "" : query.trim();
        if (safeQuery.isEmpty()) {
            return songRepository.findAll();
        }
        return songRepository.findTop50ByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(safeQuery, safeQuery);
    }

    public Song importSong(SongRequest request) {
        if (request == null) {
            throw new RuntimeException("Payload de música inválido.");
        }

        String sourceId = safeTrim(request.getSourceId());
        String title = safeTrim(request.getTitle());
        String artist = safeTrim(request.getArtist());

        Song song = null;
        if (sourceId != null) {
            song = songRepository.findBySourceId(sourceId).orElse(null);
        }

        if (song == null && title != null && artist != null) {
            song = songRepository.findFirstByTitleIgnoreCaseAndArtistIgnoreCase(title, artist).orElse(null);
        }

        if (song == null) {
            song = new Song();
        }

        if (title != null) song.setTitle(title);
        if (artist != null) song.setArtist(artist);

        String coverUrl = safeTrim(request.getCoverUrl());
        if (coverUrl != null) song.setCoverUrl(coverUrl);

        String uri = safeTrim(request.getUri());
        if (uri != null) song.setUri(uri);

        if (sourceId != null) song.setSourceId(sourceId);

        return songRepository.save(song);
    }

    public List<Playlist> listGlobalPlaylists() {
        return playlistRepository.findByGlobalPlaylistTrueOrderByIdDesc();
    }

    private void applyPlaylistPayload(Playlist playlist, PlaylistRequest request) {
        playlist.setName(request.getName().trim());
        playlist.setDescription(request.getDescription());
        playlist.setIconUrl(request.getIconUrl());
        playlist.setGlobalPlaylist(request.getGlobalPlaylist() == null || request.getGlobalPlaylist());
    }

    private String safeTrim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}