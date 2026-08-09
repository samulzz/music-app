package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.PlaybackPreference;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlaybackPreferenceRepository extends JpaRepository<PlaybackPreference, Long> {
    Optional<PlaybackPreference> findByUserIdAndSongId(Long userId, Long songId);
    List<PlaybackPreference> findByUserIdOrderByLastListenedAtDesc(Long userId);
}
