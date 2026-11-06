package me.samulsz.musicapi.services;

import me.samulsz.musicapi.repositories.*;
import org.springframework.stereotype.Service;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class CatalogMonitoringService {
    private final SongRepository songs;
    private final CatalogAlbumRepository albums;
    private final CatalogImportPriorityRepository priorities;
    private final CatalogCurationStatusService status;
    private final AudioQualityReviewRepository reviews;

    public CatalogMonitoringService(SongRepository songs, CatalogAlbumRepository albums,
            CatalogImportPriorityRepository priorities, CatalogCurationStatusService status, AudioQualityReviewRepository reviews) {
        this.songs = songs; this.albums = albums; this.priorities = priorities; this.status = status;
        this.reviews = reviews;
    }
    public Map<String, Object> dashboard() {
        var catalog = songs.findAllCatalogSongs();
        long withAlbum = catalog.stream().filter(song -> song.getAlbum() != null && !song.getAlbum().isBlank()).count();
        long withGenre = catalog.stream().filter(song -> song.getGenres() != null && !song.getGenres().isEmpty()).count();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("generatedAt", System.currentTimeMillis()); result.put("songs", catalog.size());
        result.put("songsWithAlbum", withAlbum); result.put("songsWithGenre", withGenre);
        result.put("albums", albums.count());
        result.put("visibleAlbums", albums.findByAvailableTrackCountGreaterThanEqualOrderByUpdatedAtDesc(2).size());
        result.put("pendingImports", priorities.countByStatus("PENDING"));
        result.put("importedPriorities", priorities.countByStatus("IMPORTED"));
        result.put("albumJob", status.albumStatus()); result.put("genreJob", status.genreStatus());
        result.put("audioJob", status.audioStatus());
        result.put("audioIssues", reviews.findTop50ByIssueNotOrderByCheckedAtDesc("OK"));
        result.put("audioRecent", reviews.findTop20ByOrderByCheckedAtDesc());
        long reviewed = reviews.countByCheckedAtGreaterThan(0);
        result.put("audioReviewed", reviewed);
        result.put("audioWarnings", reviews.countByIssueNot("OK"));
        result.put("audioPending", Math.max(0, catalog.size() - reviewed));
        result.put("audioComplete", reviews.countByState("COMPLETE"));
        return result;
    }
}
