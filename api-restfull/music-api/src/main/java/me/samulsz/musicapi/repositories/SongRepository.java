package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Song;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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
            WHERE s.source_id IS NOT NULL
              AND TRIM(s.source_id) <> ''
              AND (
                    :query = ''
                    OR LOWER(COALESCE(s.title, '')) LIKE LOWER(CONCAT('%', :query, '%'))
                    OR LOWER(COALESCE(s.artist, '')) LIKE LOWER(CONCAT('%', :query, '%'))
                    OR LOWER(CONCAT(COALESCE(s.title, ''), ' ', COALESCE(s.artist, ''))) LIKE LOWER(CONCAT('%', :query, '%'))
              )
            ORDER BY
              CASE
                WHEN LOWER(COALESCE(s.title, '')) = LOWER(:query) THEN 0
                WHEN LOWER(COALESCE(s.title, '')) LIKE LOWER(CONCAT(:query, '%')) THEN 1
                WHEN LOWER(COALESCE(s.artist, '')) LIKE LOWER(CONCAT(:query, '%')) THEN 2
                ELSE 3
              END,
              LOWER(COALESCE(s.title, '')),
              LOWER(COALESCE(s.artist, '')),
              s.id
            LIMIT 100
            """, nativeQuery = true)
    List<Song> searchCatalogSongs(@Param("query") String query);

    @Query(value = """
            SELECT s.*
            FROM songs s
            JOIN user_downloads ud ON ud.song_id = s.id
            JOIN users u ON u.id = ud.user_id
            WHERE u.username = :username
            ORDER BY LOWER(s.title), LOWER(s.artist), s.id
            """, nativeQuery = true)
    List<Song> findLibraryByUsername(@Param("username") String username);

    @Query(value = """
            SELECT s.*
            FROM songs s
            JOIN user_downloads ud ON ud.song_id = s.id
            GROUP BY s.id
            ORDER BY COUNT(*) DESC, LOWER(s.title), LOWER(s.artist), s.id
            LIMIT 50
            """, nativeQuery = true)
    List<Song> findMostDownloadedSongs();
}
