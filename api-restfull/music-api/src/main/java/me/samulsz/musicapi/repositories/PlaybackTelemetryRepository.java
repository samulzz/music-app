package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.PlaybackTelemetry;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PlaybackTelemetryRepository extends JpaRepository<PlaybackTelemetry, Long> {
    List<PlaybackTelemetry> findByOccurredAtGreaterThanEqualOrderByOccurredAtDesc(Long occurredAt, Pageable pageable);
    long deleteByOccurredAtLessThan(Long occurredAt);
}
