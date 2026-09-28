package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "playback_telemetry", indexes = {
        @Index(name = "idx_playback_telemetry_time", columnList = "occurred_at"),
        @Index(name = "idx_playback_telemetry_event_time", columnList = "event_type,occurred_at"),
        @Index(name = "idx_playback_telemetry_source_time", columnList = "source_id,occurred_at")
})
public class PlaybackTelemetry {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;
    @Column(nullable = false, length = 36)
    private String sessionId;
    private Long songId;
    @Column(name = "source_id", length = 120)
    private String sourceId;
    @Column(length = 240)
    private String title;
    @Column(length = 240)
    private String artist;
    @Column(name = "event_type", nullable = false, length = 24)
    private String eventType;
    @Column(nullable = false, length = 24)
    private String platform;
    @Column(length = 32)
    private String appVersion;
    private Long loadTimeMs;
    private Double positionSeconds;
    @Column(length = 500)
    private String message;
    @Column(name = "occurred_at", nullable = false)
    private Long occurredAt;

    @PrePersist
    void beforeCreate() {
        if (occurredAt == null || occurredAt <= 0) occurredAt = System.currentTimeMillis();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Long getSongId() { return songId; }
    public void setSongId(Long songId) { this.songId = songId; }
    public String getSourceId() { return sourceId; }
    public void setSourceId(String sourceId) { this.sourceId = sourceId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public String getAppVersion() { return appVersion; }
    public void setAppVersion(String appVersion) { this.appVersion = appVersion; }
    public Long getLoadTimeMs() { return loadTimeMs; }
    public void setLoadTimeMs(Long loadTimeMs) { this.loadTimeMs = loadTimeMs; }
    public Double getPositionSeconds() { return positionSeconds; }
    public void setPositionSeconds(Double positionSeconds) { this.positionSeconds = positionSeconds; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Long getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Long occurredAt) { this.occurredAt = occurredAt; }
}
