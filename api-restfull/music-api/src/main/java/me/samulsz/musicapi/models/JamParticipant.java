package me.samulsz.musicapi.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "jam_participants",
        uniqueConstraints = @UniqueConstraint(name = "uk_jam_participant_room_user", columnNames = {"room_id", "user_id"})
)
public class JamParticipant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "room_id", nullable = false)
    private JamRoom room;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private long joinedAt;

    @Column(nullable = false)
    private long lastSeenAt;

    @PrePersist
    public void beforeCreate() {
        long now = System.currentTimeMillis();
        joinedAt = now;
        lastSeenAt = now;
    }

    @PreUpdate
    public void beforeUpdate() {
        lastSeenAt = System.currentTimeMillis();
    }

    public Long getId() {
        return id;
    }

    public JamRoom getRoom() {
        return room;
    }

    public void setRoom(JamRoom room) {
        this.room = room;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public long getJoinedAt() {
        return joinedAt;
    }

    public long getLastSeenAt() {
        return lastSeenAt;
    }
}
