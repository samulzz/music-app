package me.samulsz.musicapi.services;

import me.samulsz.musicapi.repositories.*;
import org.springframework.stereotype.Service;
import java.util.Map;

@Service
public class CatalogMonitoringService {
    private final SongRepository songs;
    private final CatalogAlbumRepository albums;
    private final CatalogImportPriorityRepository priorities;
    private final CatalogCurationStatusService status;

    public CatalogMonitoringService(SongRepository songs, CatalogAlbumRepository albums,
            CatalogImportPriorityRepository priorities, CatalogCurationStatusService status) {
        this.songs = songs; this.albums = albums; this.priorities = priorities; this.status = status;
    }
    public Map<String, Object> dashboard() {
        var catalog = songs.findAllCatalogSongs();
        long withAlbum = catalog.stream().filter(song -> song.getAlbum() != null && !song.getAlbum().isBlank()).count();
        long withGenre = catalog.stream().filter(song -> song.getGenres() != null && !song.getGenres().isEmpty()).count();
        return Map.of(
                "generatedAt", System.currentTimeMillis(), "songs", catalog.size(),
                "songsWithAlbum", withAlbum, "songsWithGenre", withGenre,
                "albums", albums.count(), "visibleAlbums", albums.findByAvailableTrackCountGreaterThanEqualOrderByUpdatedAtDesc(2).size(),
                "pendingImports", priorities.countByStatus("PENDING"), "importedPriorities", priorities.countByStatus("IMPORTED"),
                "albumJob", status.albumStatus(), "genreJob", status.genreStatus());
    }
}
