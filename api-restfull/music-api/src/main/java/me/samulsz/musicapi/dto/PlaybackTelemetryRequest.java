package me.samulsz.musicapi.dto;

public class PlaybackTelemetryRequest {
    private String sessionId;
    private Long songId;
    private String sourceId;
    private String title;
    private String artist;
    private String eventType;
    private String platform;
    private String appVersion;
    private Long loadTimeMs;
    private Double positionSeconds;
    private String message;

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
}
