package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.AudioQualityReview;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AudioQualityReviewRepository extends JpaRepository<AudioQualityReview, Long> {
    List<AudioQualityReview> findTop50ByIssueNotOrderByCheckedAtDesc(String issue);
    List<AudioQualityReview> findTop20ByOrderByCheckedAtDesc();
    long countByIssueNot(String issue);
    long countByState(String state);
    long countByCheckedAtGreaterThan(long checkedAt);
}
