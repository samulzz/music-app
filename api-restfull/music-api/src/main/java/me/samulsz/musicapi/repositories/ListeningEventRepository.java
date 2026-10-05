package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.ListeningEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ListeningEventRepository extends JpaRepository<ListeningEvent, String> {
    List<ListeningEvent> findByUserIdAndOccurredAtGreaterThanEqualAndOccurredAtLessThan(Long userId, long start, long end);
    ListeningEvent findFirstByUserIdOrderByOccurredAtAsc(Long userId);
}
