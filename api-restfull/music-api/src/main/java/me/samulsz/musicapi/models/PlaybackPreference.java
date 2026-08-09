package me.samulsz.musicapi.models;

import jakarta.persistence.*;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "playback_preferences",
        uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "song_id"})
)
public class PlaybackPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "song_id", nullable = false)
    private Song song;

    @Column(nullable = false)
    private long playCount;

    @Column(nullable = false)
    private long completedCount;

    @Column(nullable = false)
    private long listenedSeconds;

    @Column(nullable = false)
    private LocalDateTime lastListenedAt;

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Song getSong() { return song; }
    public void setSong(Song song) { this.song = song; }
    public long getPlayCount() { return playCount; }
    public void setPlayCount(long playCount) { this.playCount = playCount; }
    public long getCompletedCount() { return completedCount; }
    public void setCompletedCount(long completedCount) { this.completedCount = completedCount; }
    public long getListenedSeconds() { return listenedSeconds; }
    public void setListenedSeconds(long listenedSeconds) { this.listenedSeconds = listenedSeconds; }
    public LocalDateTime getLastListenedAt() { return lastListenedAt; }
    public void setLastListenedAt(LocalDateTime lastListenedAt) { this.lastListenedAt = lastListenedAt; }
}
