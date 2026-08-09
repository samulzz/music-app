package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "playback_devices", uniqueConstraints = @UniqueConstraint(name = "uk_playback_device_user_device", columnNames = {"user_id", "device_id"}))
public class PlaybackDevice {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "user_id", nullable = false) private User user;
    @Column(name = "device_id", nullable = false, length = 100) private String deviceId;
    @Column(name = "device_name", nullable = false, length = 100) private String deviceName;
    @Column(nullable = false, length = 30) private String platform;
    @Column(name = "last_seen_at", nullable = false) private long lastSeenAt;
    @Column(name = "processed_command_revision", nullable = false) private long processedCommandRevision;
    public Long getId() { return id; }
    public User getUser() { return user; } public void setUser(User value) { user = value; }
    public String getDeviceId() { return deviceId; } public void setDeviceId(String value) { deviceId = value; }
    public String getDeviceName() { return deviceName; } public void setDeviceName(String value) { deviceName = value; }
    public String getPlatform() { return platform; } public void setPlatform(String value) { platform = value; }
    public long getLastSeenAt() { return lastSeenAt; } public void setLastSeenAt(long value) { lastSeenAt = value; }
    public long getProcessedCommandRevision() { return processedCommandRevision; } public void setProcessedCommandRevision(long value) { processedCommandRevision = value; }
}
