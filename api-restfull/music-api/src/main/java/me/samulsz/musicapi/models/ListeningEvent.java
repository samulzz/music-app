package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "listening_events", indexes = @Index(name = "ix_listening_user_time", columnList = "user_id,occurred_at"))
public class ListeningEvent {
    @Id public String id;
    @Column(name = "user_id", nullable = false) public Long userId;
    public String sessionId;
    public Long songId;
    public String title;
    public String artist;
    @Column(length = 2048) public String coverUrl;
    @Column(length = 500) public String genres;
    public int seconds;
    @Column(name = "occurred_at", nullable = false) public long occurredAt;
}
