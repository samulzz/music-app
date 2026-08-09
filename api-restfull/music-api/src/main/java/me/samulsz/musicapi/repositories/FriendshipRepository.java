package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.Friendship;
import me.samulsz.musicapi.models.FriendshipStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FriendshipRepository extends JpaRepository<Friendship, Long> {

    @Query("""
            select f from Friendship f
            where (
                lower(f.requester.username) = lower(:leftUsername)
                and lower(f.addressee.username) = lower(:rightUsername)
            ) or (
                lower(f.requester.username) = lower(:rightUsername)
                and lower(f.addressee.username) = lower(:leftUsername)
            )
            """)
    Optional<Friendship> findBetween(
            @Param("leftUsername") String leftUsername,
            @Param("rightUsername") String rightUsername
    );

    @Query("""
            select f from Friendship f
            where (f.requester.username = :username or f.addressee.username = :username)
            and f.status = :status
            order by f.updatedAt desc
            """)
    List<Friendship> findByParticipantAndStatus(
            @Param("username") String username,
            @Param("status") FriendshipStatus status
    );

    List<Friendship> findByAddresseeUsernameAndStatusOrderByUpdatedAtDesc(
            String username,
            FriendshipStatus status
    );

    List<Friendship> findByRequesterUsernameAndStatusOrderByUpdatedAtDesc(
            String username,
            FriendshipStatus status
    );
}
