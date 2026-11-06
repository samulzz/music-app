package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.PlaybackPreference;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface PlaybackPreferenceRepository extends JpaRepository<PlaybackPreference, Long> {
    @Query(value = "SELECT song_id FROM listening_events WHERE user_id = :userId AND seconds > 0 GROUP BY song_id ORDER BY MAX(occurred_at) DESC LIMIT 12", nativeQuery = true)
    List<Long> findRecentlyListenedSongIds(@org.springframework.data.repository.query.Param("userId") Long userId);
    Optional<PlaybackPreference> findByUserIdAndSongId(Long userId, Long songId);
    List<PlaybackPreference> findByUserIdOrderByLastListenedAtDesc(Long userId);
    @Query("select p.song from PlaybackPreference p where p.user.id = :userId and p.liked = true order by p.song.title asc")
    List<me.samulsz.musicapi.models.Song> findLikedSongsByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);

    @Query(value = """
            SELECT s.artist
            FROM playback_preferences p JOIN songs s ON s.id = p.song_id
            WHERE s.artist IS NOT NULL AND TRIM(s.artist) <> '' AND p.do_not_recommend = FALSE
            GROUP BY s.artist
            ORDER BY SUM(p.play_count * 5 + p.completed_count * 8 + p.repeated_count * 12
              + p.listened_seconds / 60 - p.skipped_count * 10 + IF(p.liked, 50, 0)) DESC
            LIMIT 30
            """, nativeQuery = true)
    List<String> findMostListenedArtists();
}
