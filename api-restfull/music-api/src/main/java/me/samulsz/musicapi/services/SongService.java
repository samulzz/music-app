package me.samulsz.musicapi.services;

import me.samulsz.musicapi.dto.SongRequest;
import me.samulsz.musicapi.models.Song;
import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.repositories.SongRepository;
import me.samulsz.musicapi.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class SongService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SongRepository songRepository;

    @Autowired
    private MusicService musicService;

    public void saveSongForUser(String username, SongRequest request) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado!"));

        Song song = null;
        if (request.getSourceId() != null && !request.getSourceId().isBlank()) {
            song = songRepository.findBySourceId(request.getSourceId()).orElse(null);
        }
        if (song == null && request.getUri() != null && !request.getUri().isBlank()) {
            song = songRepository.findByUri(request.getUri()).orElse(null);
        }

        if (song == null) {
            song = new Song();
        }

        song.setTitle(request.getTitle());
        song.setArtist(request.getArtist());
        if (request.getAlbum() != null && !request.getAlbum().isBlank()) song.setAlbum(request.getAlbum().trim());
        if (request.getAlbumArtist() != null && !request.getAlbumArtist().isBlank()) song.setAlbumArtist(request.getAlbumArtist().trim());
        if (request.getAlbum() != null && !request.getAlbum().isBlank()) song.setAlbumMetadataChecked(true);
        song.setUri(request.getUri());
        song.setCoverUrl(request.getCoverUrl());
        if (request.getSourceId() != null && !request.getSourceId().isBlank()) {
            song.setSourceId(request.getSourceId());
        }
        mergeGenres(song, request.getGenres());

        song = songRepository.save(song);

        user.getDownloadedSongs().add(song);
        userRepository.save(user);
    }

    public java.util.List<Song> getUserLibrary(String username) {
        if (userRepository.findByUsername(username).isEmpty()) {
            throw new RuntimeException("Utilizador não encontrado!");
        }

        return songRepository.findLibraryByUsername(username);
    }

    public java.util.List<Song> searchPrecachedCatalog(String query) {
        String safeQuery = query == null ? "" : query.trim();
        return CatalogIdentity.unique(songRepository.searchCatalogSongs(safeQuery).stream()
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList()).stream().limit(50).toList();
    }

    public java.util.List<Song> findByGenre(String genre) {
        String normalized = normalizeGenre(genre);
        if (normalized == null) return java.util.List.of();
        return CatalogIdentity.unique(songRepository.findByExactGenre(normalized).stream()
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList()).stream().limit(100).toList();
    }

    public java.util.List<Song> findByArtist(String artist) {
        String name = artist == null ? "" : artist.trim();
        if (name.isBlank() || name.length() > 120) return java.util.List.of();
        return CatalogIdentity.unique(songRepository.findCatalogSongsByArtist(name).stream()
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList());
    }

    public java.util.List<Song> findByAlbum(String album, String artist) {
        String name = album == null ? "" : album.trim();
        String albumArtist = artist == null ? "" : artist.trim();
        if (name.isBlank() || name.length() > 180 || albumArtist.length() > 180) return java.util.List.of();
        return CatalogIdentity.unique(songRepository.findCatalogSongsByAlbum(name, albumArtist).stream()
                .filter(song -> musicService.hasPrecachedAudio(song.getSourceId()))
                .toList());
    }

    private void mergeGenres(Song song, java.util.Set<String> incoming) {
        if (incoming == null) return;
        java.util.Set<String> merged = new java.util.LinkedHashSet<>(song.getGenres());
        incoming.stream().map(this::normalizeGenre).filter(java.util.Objects::nonNull).forEach(merged::add);
        song.setGenres(merged);
    }

    private String normalizeGenre(String value) {
        if (value == null) return null;
        String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(java.util.Locale.ROOT).trim();
        return java.util.Set.of("funk", "rap", "trap", "sertanejo", "pagode", "samba", "forro", "piseiro", "gospel", "mpb", "pop", "rock", "phonk").contains(normalized)
                ? normalized : null;
    }

    public void removeSongFromUser(String username, Long songId) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new RuntimeException("Usuário não encontrado!"));

        boolean removed = user.getDownloadedSongs().removeIf(song -> song.getId().equals(songId));

        if (!removed) {
            throw new RuntimeException("Música não encontrada na sua biblioteca!");
        }

        userRepository.save(user);
    }
}
