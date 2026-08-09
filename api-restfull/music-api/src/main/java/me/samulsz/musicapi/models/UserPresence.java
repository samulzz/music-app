package me.samulsz.musicapi.models;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(
        name = "user_presence",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_presence_user", columnNames = "user_id")
)
public class UserPresence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(nullable = false)
    private boolean online;

    @Column(name = "last_seen_at", nullable = false)
    private long lastSeenAt;

    @Column(name = "last_listened_at", nullable = false)
    private long lastListenedAt;

    @Column(nullable = false)
    private boolean playing;

    @Column(name = "position_seconds", nullable = false)
    private double positionSeconds;

    @Column(name = "active_jam_code", length = 32)
    private String activeJamCode = "";

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

    @Column(name = "show_online_status", nullable = false)
    private boolean showOnlineStatus = true;

    @Column(name = "show_listening_activity", nullable = false)
    private boolean showListeningActivity = true;

    @Column(name = "show_last_seen", nullable = false)
    private boolean showLastSeen = true;

    @Column(name = "show_active_jam", nullable = false)
    private boolean showActiveJam = true;

    @Column(name = "avatar_icon", nullable = false, length = 40)
    private String avatarIcon = "person";

    @PrePersist
    public void beforeInsert() {
        if (activeJamCode == null) activeJamCode = "";
        if (songId == null) songId = "";
        if (songSourceId == null) songSourceId = "";
        if (songTitle == null) songTitle = "";
        if (songArtist == null) songArtist = "";
        if (songArtworkUrl == null) songArtworkUrl = "";
        if (songRemoteUrl == null) songRemoteUrl = "";
        if (avatarIcon == null || avatarIcon.isBlank()) avatarIcon = "person";
    }

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public boolean isOnline() {
        return online;
    }

    public void setOnline(boolean online) {
        this.online = online;
    }

    public long getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(long lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public long getLastListenedAt() {
        return lastListenedAt;
    }

    public void setLastListenedAt(long lastListenedAt) {
        this.lastListenedAt = lastListenedAt;
    }

    public boolean isPlaying() {
        return playing;
    }

    public void setPlaying(boolean playing) {
        this.playing = playing;
    }

    public double getPositionSeconds() {
        return positionSeconds;
    }

    public void setPositionSeconds(double positionSeconds) {
        this.positionSeconds = positionSeconds;
    }

    public String getActiveJamCode() {
        return activeJamCode;
    }

    public void setActiveJamCode(String activeJamCode) {
        this.activeJamCode = activeJamCode;
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

    public boolean isShowOnlineStatus() {
        return showOnlineStatus;
    }

    public void setShowOnlineStatus(boolean showOnlineStatus) {
        this.showOnlineStatus = showOnlineStatus;
    }

    public boolean isShowListeningActivity() {
        return showListeningActivity;
    }

    public void setShowListeningActivity(boolean showListeningActivity) {
        this.showListeningActivity = showListeningActivity;
    }

    public boolean isShowLastSeen() {
        return showLastSeen;
    }

    public void setShowLastSeen(boolean showLastSeen) {
        this.showLastSeen = showLastSeen;
    }

    public boolean isShowActiveJam() {
        return showActiveJam;
    }

    public void setShowActiveJam(boolean showActiveJam) {
        this.showActiveJam = showActiveJam;
    }

    public String getAvatarIcon() {
        return avatarIcon;
    }

    public void setAvatarIcon(String avatarIcon) {
        this.avatarIcon = avatarIcon;
    }
}
