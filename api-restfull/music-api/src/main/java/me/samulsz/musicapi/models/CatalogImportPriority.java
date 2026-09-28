package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "catalog_import_priorities", uniqueConstraints = @UniqueConstraint(columnNames = "external_track_id"))
public class CatalogImportPriority {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "external_track_id", nullable = false, length = 100) private String externalTrackId;
    @Column(nullable = false) private String title;
    private String artist;
    private String album;
    private String albumArtist;
    private String coverUrl;
    private Integer durationMs;
    @Column(nullable = false, length = 20) private String status = "PENDING";
    private String reason;
    private int priority;
    private long createdAt;
    private long updatedAt;

    public Long getId() { return id; }
    public String getExternalTrackId() { return externalTrackId; }
    public void setExternalTrackId(String value) { externalTrackId = value; }
    public String getTitle() { return title; }
    public void setTitle(String value) { title = value; }
    public String getArtist() { return artist; }
    public void setArtist(String value) { artist = value; }
    public String getAlbum() { return album; }
    public void setAlbum(String value) { album = value; }
    public String getAlbumArtist() { return albumArtist; }
    public void setAlbumArtist(String value) { albumArtist = value; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String value) { coverUrl = value; }
    public Integer getDurationMs() { return durationMs; }
    public void setDurationMs(Integer value) { durationMs = value; }
    public String getStatus() { return status; }
    public void setStatus(String value) { status = value; }
    public String getReason() { return reason; }
    public void setReason(String value) { reason = value; }
    public int getPriority() { return priority; }
    public void setPriority(int value) { priority = value; }
    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long value) { createdAt = value; }
    public long getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(long value) { updatedAt = value; }
}
