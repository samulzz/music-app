package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.CatalogAlbum;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface CatalogAlbumRepository extends JpaRepository<CatalogAlbum, Long> {
    Optional<CatalogAlbum> findByExternalId(String externalId);
    List<CatalogAlbum> findByAvailableTrackCountGreaterThanEqualOrderByUpdatedAtDesc(int minimum);
}
