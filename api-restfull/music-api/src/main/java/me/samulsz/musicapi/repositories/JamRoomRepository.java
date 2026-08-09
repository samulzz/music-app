package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.JamRoom;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface JamRoomRepository extends JpaRepository<JamRoom, Long> {
    boolean existsByCode(String code);
    Optional<JamRoom> findByCodeAndActiveTrue(String code);
}
