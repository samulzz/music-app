package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PlaylistRepository extends JpaRepository<Playlist, Long> {
    interface DiscoverySummary {
        Long getId(); String getName(); String getDescription(); String getIconUrl();
        String getCollectionType(); Long getSongCount(); String getAlbumArtist(); String getArtist();
    }
    @org.springframework.data.jpa.repository.Query("""
            select p.id as id, p.name as name, p.description as description, p.iconUrl as iconUrl,
                   p.collectionType as collectionType, count(s) as songCount,
                   min(s.albumArtist) as albumArtist, min(s.artist) as artist
            from Playlist p left join p.songs s where p.globalPlaylist = true
            group by p.id, p.name, p.description, p.iconUrl, p.collectionType
            """)
    List<DiscoverySummary> findDiscoverySummaries();
    @org.springframework.data.jpa.repository.Query("""
            select p.id as id, p.name as name, p.description as description, p.iconUrl as iconUrl,
                   p.collectionType as collectionType, count(s) as songCount,
                   min(s.albumArtist) as albumArtist, min(s.artist) as artist
            from Playlist p left join p.songs s where p.owner.username = :username
            group by p.id, p.name, p.description, p.iconUrl, p.collectionType order by p.id desc
            """)
    List<DiscoverySummary> findPersonalSummaries(@org.springframework.data.repository.query.Param("username") String username);
    org.springframework.data.domain.Page<Playlist> findByGlobalPlaylistTrueOrderByIdAsc(org.springframework.data.domain.Pageable pageable);
    List<Playlist> findByGlobalPlaylistTrueOrderByIdDesc();

    Optional<Playlist> findFirstByGlobalPlaylistTrueAndName(String name);

    List<Playlist> findByOwnerUsernameOrderByIdDesc(String username);
    @org.springframework.data.jpa.repository.Query("select p from Playlist p where p.pendingTracks is not empty")
    List<Playlist> findPendingPlaylists(org.springframework.data.domain.Pageable pageable);
    @org.springframework.data.jpa.repository.Query("select count(p) from Playlist p where p.pendingTracks is not empty")
    long countPendingPlaylists();
}
