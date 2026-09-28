package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.CatalogImportPriority;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;

public interface CatalogImportPriorityRepository extends JpaRepository<CatalogImportPriority, Long> {
    Optional<CatalogImportPriority> findByExternalTrackId(String externalTrackId);
    List<CatalogImportPriority> findByStatusOrderByPriorityDescCreatedAtAsc(String status, Pageable pageable);
    long countByStatus(String status);
}
