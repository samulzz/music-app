package me.samulsz.musicapi.models;

import jakarta.persistence.*;

@Entity
@Table(name = "catalog_albums", uniqueConstraints = @UniqueConstraint(columnNames = "external_id"))
public class CatalogAlbum {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "external_id", nullable = false, length = 80) private String externalId;
    @Column(nullable = false) private String name;
    private String artist;
    private String coverUrl;
    private int expectedTrackCount;
    private int availableTrackCount;
    private long updatedAt;

    public Long getId() { return id; }
    public String getExternalId() { return externalId; }
    public void setExternalId(String externalId) { this.externalId = externalId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getArtist() { return artist; }
    public void setArtist(String artist) { this.artist = artist; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
    public int getExpectedTrackCount() { return expectedTrackCount; }
    public void setExpectedTrackCount(int expectedTrackCount) { this.expectedTrackCount = expectedTrackCount; }
    public int getAvailableTrackCount() { return availableTrackCount; }
    public void setAvailableTrackCount(int availableTrackCount) { this.availableTrackCount = availableTrackCount; }
    public long getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(long updatedAt) { this.updatedAt = updatedAt; }
}
