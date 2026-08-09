package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.DailyMix;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface DailyMixRepository extends JpaRepository<DailyMix, Long> {
    Optional<DailyMix> findByUserIdAndMixDate(Long userId, LocalDate mixDate);
    Optional<DailyMix> findTopByUserIdAndMixDateBeforeOrderByMixDateDesc(Long userId, LocalDate mixDate);
}
