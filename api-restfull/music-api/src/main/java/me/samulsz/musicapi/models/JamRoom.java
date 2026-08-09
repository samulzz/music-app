package me.samulsz.musicapi.models;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(
        name = "jam_rooms",
        uniqueConstraints = @UniqueConstraint(name = "uk_jam_rooms_code", columnNames = "code")
)
public class JamRoom {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 16)
    private String code;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    private User owner;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "allow_participant_control", nullable = false)
    private boolean allowParticipantControl;

    @Column(name = "allow_participant_queue", nullable = false)
    private boolean allowParticipantQueue = true;

    @Column(name = "sync_volume", nullable = false)
    private boolean syncVolume;

    @Column(name = "volume_level", nullable = false)
    private double volumeLevel = 1;

    @Column(name = "position_seconds", nullable = false)
    private double positionSeconds;

    @Column(nullable = false)
    private boolean playing;

    @Column(name = "state_updated_at", nullable = false)
    private long stateUpdatedAt;

    @Column(name = "last_touched_at", nullable = false)
    private long lastTouchedAt;

    @Column(nullable = false)
    private long createdAt;

    @Column(nullable = false)
    private long updatedAt;

    @Column(name = "song_id_value")
    private String songId = "";

    @Column(name = "song_source_id")
    private String songSourceId = "";

    @Column(name = "song_title")
    private String songTitle = "";

    @Column(name = "song_artist")
    private String songArtist = "";

    @Column(name = "song_artwork_url", length = 1000)
    private String songArtworkUrl = "";

    @Column(name = "song_remote_url", length = 1000)
    private String songRemoteUrl = "";

    @OneToMany(mappedBy = "room", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<JamParticipant> participants = new ArrayList<>();

    @OneToMany(mappedBy = "room", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<JamQueueItem> queueItems = new ArrayList<>();

    @PrePersist
    public void beforeCreate() {
        long now = System.currentTimeMillis();
        createdAt = now;
        updatedAt = now;
        if (lastTouchedAt <= 0) lastTouchedAt = now;
        if (stateUpdatedAt <= 0) stateUpdatedAt = now;
    }

    @PreUpdate
    public void beforeUpdate() {
        updatedAt = System.currentTimeMillis();
    }

    public Long getId() {
        return id;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public User getOwner() {
        return owner;
    }

    public void setOwner(User owner) {
        this.owner = owner;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public boolean isAllowParticipantControl() {
        return allowParticipantControl;
    }

    public void setAllowParticipantControl(boolean allowParticipantControl) {
        this.allowParticipantControl = allowParticipantControl;
    }

    public boolean isAllowParticipantQueue() {
        return allowParticipantQueue;
    }

    public void setAllowParticipantQueue(boolean allowParticipantQueue) {
        this.allowParticipantQueue = allowParticipantQueue;
    }

    public boolean isSyncVolume() {
        return syncVolume;
    }

    public void setSyncVolume(boolean syncVolume) {
        this.syncVolume = syncVolume;
    }

    public double getVolumeLevel() {
        return volumeLevel;
    }

    public void setVolumeLevel(double volumeLevel) {
        this.volumeLevel = volumeLevel;
    }

    public double getPositionSeconds() {
        return positionSeconds;
    }

    public void setPositionSeconds(double positionSeconds) {
        this.positionSeconds = positionSeconds;
    }

    public boolean isPlaying() {
        return playing;
    }

    public void setPlaying(boolean playing) {
        this.playing = playing;
    }

    public long getStateUpdatedAt() {
        return stateUpdatedAt;
    }

    public void setStateUpdatedAt(long stateUpdatedAt) {
        this.stateUpdatedAt = stateUpdatedAt;
    }

    public long getLastTouchedAt() {
        return lastTouchedAt;
    }

    public void setLastTouchedAt(long lastTouchedAt) {
        this.lastTouchedAt = lastTouchedAt;
    }

    public String getSongId() {
        return songId;
    }

    public void setSongId(String songId) {
        this.songId = songId;
    }

    public String getSongSourceId() {
        return songSourceId;
    }

    public void setSongSourceId(String songSourceId) {
        this.songSourceId = songSourceId;
    }

    public String getSongTitle() {
        return songTitle;
    }

    public void setSongTitle(String songTitle) {
        this.songTitle = songTitle;
    }

    public String getSongArtist() {
        return songArtist;
    }

    public void setSongArtist(String songArtist) {
        this.songArtist = songArtist;
    }

    public String getSongArtworkUrl() {
        return songArtworkUrl;
    }

    public void setSongArtworkUrl(String songArtworkUrl) {
        this.songArtworkUrl = songArtworkUrl;
    }

    public String getSongRemoteUrl() {
        return songRemoteUrl;
    }

    public void setSongRemoteUrl(String songRemoteUrl) {
        this.songRemoteUrl = songRemoteUrl;
    }

    public List<JamParticipant> getParticipants() {
        return participants;
    }

    public List<JamQueueItem> getQueueItems() {
        return queueItems;
    }
}
