package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, Long> {
    org.springframework.data.domain.Page<Playlist> findByGlobalPlaylistTrueOrderByIdAsc(org.springframework.data.domain.Pageable pageable);
    List<Playlist> findByGlobalPlaylistTrueOrderByIdDesc();

    Optional<Playlist> findFirstByGlobalPlaylistTrueAndName(String name);

    List<Playlist> findByOwnerUsernameOrderByIdDesc(String username);
    @org.springframework.data.jpa.repository.Query("select p from Playlist p where p.pendingTracks is not empty")
    List<Playlist> findPendingPlaylists(org.springframework.data.domain.Pageable pageable);
    @org.springframework.data.jpa.repository.Query("select count(p) from Playlist p where p.pendingTracks is not empty")
    long countPendingPlaylists();
}
