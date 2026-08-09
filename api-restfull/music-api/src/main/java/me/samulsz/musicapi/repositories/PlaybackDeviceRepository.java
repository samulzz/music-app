package me.samulsz.musicapi.repositories;
import me.samulsz.musicapi.models.PlaybackDevice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface PlaybackDeviceRepository extends JpaRepository<PlaybackDevice, Long> {
    Optional<PlaybackDevice> findByUser_IdAndDeviceId(Long userId, String deviceId);
    List<PlaybackDevice> findByUser_IdOrderByLastSeenAtDesc(Long userId);
}
