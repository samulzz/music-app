package me.samulsz.musicapi.repositories;
import me.samulsz.musicapi.models.AccountPlayback;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface AccountPlaybackRepository extends JpaRepository<AccountPlayback, Long> {
    Optional<AccountPlayback> findByUser_Id(Long userId);
}
