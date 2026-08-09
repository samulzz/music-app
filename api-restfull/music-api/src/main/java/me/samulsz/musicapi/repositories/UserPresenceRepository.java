package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.User;
import me.samulsz.musicapi.models.UserPresence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserPresenceRepository extends JpaRepository<UserPresence, Long> {
    Optional<UserPresence> findByUser(User user);
    Optional<UserPresence> findByUserUsername(String username);
}
