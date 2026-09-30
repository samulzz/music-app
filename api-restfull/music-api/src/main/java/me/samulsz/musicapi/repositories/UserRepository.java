package me.samulsz.musicapi.repositories;

import me.samulsz.musicapi.models.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.username = :username")
    Optional<User> findByUsernameForUpdate(@Param("username") String username);

    @Query("""
            select u from User u
            where lower(u.username) like lower(concat('%', :query, '%'))
            and lower(u.username) <> lower(:username)
            order by u.username asc
            """)
    List<User> searchUsers(
            @Param("query") String query,
            @Param("username") String username,
            Pageable pageable
    );
}
