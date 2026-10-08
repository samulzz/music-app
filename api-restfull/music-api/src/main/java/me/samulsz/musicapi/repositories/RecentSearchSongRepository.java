package me.samulsz.musicapi.repositories;
import me.samulsz.musicapi.models.RecentSearchSong;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface RecentSearchSongRepository extends JpaRepository<RecentSearchSong, Long> {
    List<RecentSearchSong> findTop20ByUserUsernameOrderBySearchedAtDesc(String username);
    Optional<RecentSearchSong> findByUserUsernameAndSongId(String username, Long songId);
}
