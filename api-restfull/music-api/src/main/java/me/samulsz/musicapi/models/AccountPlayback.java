package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "account_playback", uniqueConstraints = @UniqueConstraint(name = "uk_account_playback_user", columnNames = "user_id"))
public class AccountPlayback {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @OneToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;
    @Column(name = "active_device_id", length = 100) private String activeDeviceId = "";
    @Column(name = "song_id_value") private String songId = "";
    @Column(name = "song_source_id") private String songSourceId = "";
    @Column(name = "song_title") private String songTitle = "";
    @Column(name = "song_artist") private String songArtist = "";
    @Column(name = "song_artwork_url", length = 1000) private String songArtworkUrl = "";
    @Column(name = "song_remote_url", length = 1000) private String songRemoteUrl = "";
    @Column(name = "position_seconds", nullable = false) private double positionSeconds;
    @Column(name = "duration_seconds", nullable = false) private double durationSeconds;
    @Column(nullable = false) private boolean playing;
    @Column(name = "volume_level", nullable = false) private double volumeLevel = 1;
    @Column(name = "state_updated_at", nullable = false) private long stateUpdatedAt;
    @Column(name = "command_revision", nullable = false) private long commandRevision;
    @Column(name = "command_action", length = 40) private String commandAction = "";
    @Column(name = "command_value", nullable = false) private double commandValue;
    @Column(name = "command_target_device_id", length = 100) private String commandTargetDeviceId = "";

    @PrePersist public void beforeInsert() { if (stateUpdatedAt == 0) stateUpdatedAt = System.currentTimeMillis(); normalize(); }
    @PreUpdate public void beforeUpdate() { normalize(); }
    private void normalize() {
        if (activeDeviceId == null) activeDeviceId = "";
        if (songId == null) songId = "";
        if (songSourceId == null) songSourceId = "";
        if (songTitle == null) songTitle = "";
        if (songArtist == null) songArtist = "";
        if (songArtworkUrl == null) songArtworkUrl = "";
        if (songRemoteUrl == null) songRemoteUrl = "";
        if (commandAction == null) commandAction = "";
        if (commandTargetDeviceId == null) commandTargetDeviceId = "";
    }
    public Long getId() { return id; }
    public User getUser() { return user; } public void setUser(User user) { this.user = user; }
    public String getActiveDeviceId() { return activeDeviceId; } public void setActiveDeviceId(String value) { activeDeviceId = value; }
    public String getSongId() { return songId; } public void setSongId(String value) { songId = value; }
    public String getSongSourceId() { return songSourceId; } public void setSongSourceId(String value) { songSourceId = value; }
    public String getSongTitle() { return songTitle; } public void setSongTitle(String value) { songTitle = value; }
    public String getSongArtist() { return songArtist; } public void setSongArtist(String value) { songArtist = value; }
    public String getSongArtworkUrl() { return songArtworkUrl; } public void setSongArtworkUrl(String value) { songArtworkUrl = value; }
    public String getSongRemoteUrl() { return songRemoteUrl; } public void setSongRemoteUrl(String value) { songRemoteUrl = value; }
    public double getPositionSeconds() { return positionSeconds; } public void setPositionSeconds(double value) { positionSeconds = value; }
    public double getDurationSeconds() { return durationSeconds; } public void setDurationSeconds(double value) { durationSeconds = value; }
    public boolean isPlaying() { return playing; } public void setPlaying(boolean value) { playing = value; }
    public double getVolumeLevel() { return volumeLevel; } public void setVolumeLevel(double value) { volumeLevel = value; }
    public long getStateUpdatedAt() { return stateUpdatedAt; } public void setStateUpdatedAt(long value) { stateUpdatedAt = value; }
    public long getCommandRevision() { return commandRevision; } public void setCommandRevision(long value) { commandRevision = value; }
    public String getCommandAction() { return commandAction; } public void setCommandAction(String value) { commandAction = value; }
    public double getCommandValue() { return commandValue; } public void setCommandValue(double value) { commandValue = value; }
    public String getCommandTargetDeviceId() { return commandTargetDeviceId; } public void setCommandTargetDeviceId(String value) { commandTargetDeviceId = value; }
}
