package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, Long> {
    List<Playlist> findByGlobalPlaylistTrueOrderByIdDesc();

    Optional<Playlist> findFirstByGlobalPlaylistTrueAndName(String name);

    List<Playlist> findByOwnerUsernameOrderByIdDesc(String username);
}
