package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Song;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SongRepository extends JpaRepository<Song, Long> {

    Optional<Song> findByUri(String uri);

    Optional<Song> findBySourceId(String sourceId);

    Optional<Song> findFirstByTitleIgnoreCaseAndArtistIgnoreCase(String title, String artist);

    List<Song> findTop50ByTitleContainingIgnoreCaseOrArtistContainingIgnoreCase(String title, String artist);

    @Query(value = """
            SELECT s.*
            FROM songs s
            JOIN user_downloads ud ON ud.song_id = s.id
            GROUP BY s.id
            ORDER BY COUNT(*) DESC
            LIMIT 50
            """, nativeQuery = true)
    List<Song> findMostDownloadedSongs();
}
